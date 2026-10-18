#include "Js_DiscImageDeviceStream.h"
#include <algorithm>
#include <cstring>
#include <stdexcept>
#include <emscripten.h>
#include <emscripten/threading.h>

// Shared with DiscImageDevice.signal. done is the futex word.
struct DISC_READ_SLOT
{
	int32 done;
	int32 error;
	int32 bytesRead;
};

static DISC_READ_SLOT g_readSlot = {};

void CJsDiscImageDeviceStream::Seek(int64 position, Framework::STREAM_SEEK_DIRECTION whence)
{
	switch(whence)
	{
	case Framework::STREAM_SEEK_SET:
		m_position = position;
		break;
	case Framework::STREAM_SEEK_CUR:
		m_position += position;
		break;
	case Framework::STREAM_SEEK_END:
	{
		// Split the file size in JavaScript. EM_ASM_INT returns a signed 32-bit
		// value, so the low half has to be taken modulo 2^32 before the cast.
		uint32 positionLo = static_cast<uint32>(MAIN_THREAD_EM_ASM_INT({return Module.discImageDevice.getFileSizeLow();}));
		uint32 positionHi = static_cast<uint32>(MAIN_THREAD_EM_ASM_INT({return Module.discImageDevice.getFileSizeHigh();}));
		m_position = static_cast<uint64>(positionLo) | (static_cast<uint64>(positionHi) << 32);
	}
	break;
	}
}

uint64 CJsDiscImageDeviceStream::Tell()
{
	return m_position;
}

uint32 CJsDiscImageDeviceStream::ReadFromDevice(void* buffer, uint32 size, uint64 offset)
{
	if(size == 0) return 0;

	__atomic_store_n(&g_readSlot.done, 0, __ATOMIC_SEQ_CST);
	__atomic_store_n(&g_readSlot.error, 0, __ATOMIC_SEQ_CST);
	__atomic_store_n(&g_readSlot.bytesRead, 0, __ATOMIC_SEQ_CST);

	uint32 positionLow = static_cast<uint32>(offset);
	uint32 positionHigh = static_cast<uint32>(offset >> 32);

	// The read runs on the browser thread. Wait on the slot instead of polling
	// isDone: each poll was itself a trip back to that thread.
	MAIN_THREAD_EM_ASM({
		let posLow = $1 >>> 0;
		let posHigh = $2 >>> 0;
		let position = posLow + (posHigh * 4294967296);
		Module.discImageDevice.read($0, position, $3, $4);
	},
	                   buffer, positionLow, positionHigh, size, &g_readSlot.done);

	while(__atomic_load_n(&g_readSlot.done, __ATOMIC_SEQ_CST) == 0)
	{
		emscripten_futex_wait(&g_readSlot.done, 0, 1000.0);
	}
	if(__atomic_load_n(&g_readSlot.error, __ATOMIC_SEQ_CST) != 0)
	{
		throw std::runtime_error("Failed to read disc image.");
	}
	return static_cast<uint32>(__atomic_load_n(&g_readSlot.bytesRead, __ATOMIC_SEQ_CST));
}

bool CJsDiscImageDeviceStream::CacheCovers(uint64 offset) const
{
	return (m_cacheSize != 0) && (offset >= m_cacheOrigin) && (offset < (m_cacheOrigin + m_cacheSize));
}

bool CJsDiscImageDeviceStream::FillCache(uint64 offset)
{
	if(m_cache.size() != CACHE_BYTES)
	{
		m_cache.resize(CACHE_BYTES);
	}
	uint32 got = ReadFromDevice(m_cache.data(), CACHE_BYTES, offset);
	m_cacheOrigin = offset;
	m_cacheSize = got;
	return got != 0;
}

uint64 CJsDiscImageDeviceStream::Read(void* buffer, uint64 size)
{
	if(size == 0) return 0;

	auto dest = reinterpret_cast<uint8*>(buffer);
	uint64 copied = 0;
	while(copied < size)
	{
		if(!CacheCovers(m_position))
		{
			if(!FillCache(m_position))
			{
				break;
			}
		}
		uint32 index = static_cast<uint32>(m_position - m_cacheOrigin);
		uint32 available = m_cacheSize - index;
		uint32 chunk = static_cast<uint32>(std::min<uint64>(size - copied, available));
		memcpy(dest + copied, m_cache.data() + index, chunk);
		m_position += chunk;
		copied += chunk;
	}
	return copied;
}

uint64 CJsDiscImageDeviceStream::Write(const void*, uint64)
{
	throw std::runtime_error("Not supported.");
}

bool CJsDiscImageDeviceStream::IsEOF()
{
	throw std::runtime_error("Not supported.");
}

void CJsDiscImageDeviceStream::Flush()
{
}
