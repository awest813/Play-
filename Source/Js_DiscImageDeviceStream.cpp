#include "Js_DiscImageDeviceStream.h"
#include <stdexcept>
#include <cassert>
#include <emscripten.h>
#include <unistd.h>

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

uint64 CJsDiscImageDeviceStream::Read(void* buffer, uint64 size)
{
	if(size == 0) return 0;

	assert(size <= std::numeric_limits<uint32>::max());

	uint32 positionLow = static_cast<uint32>(m_position);
	uint32 positionHigh = static_cast<uint32>(m_position >> 32);

	MAIN_THREAD_EM_ASM({
		let posLow = $1 >>> 0;
		let posHigh = $2 >>> 0;
		let position = posLow + (posHigh * 4294967296);
		Module.discImageDevice.read($0, position, $3);
	},
	                   buffer, positionLow, positionHigh, static_cast<uint32>(size));
	while(!MAIN_THREAD_EM_ASM_INT({return Module.discImageDevice.isDone() ? 1 : 0;}))
	{
		usleep(100);
	}
	if(MAIN_THREAD_EM_ASM_INT({return Module.discImageDevice.hasError() ? 1 : 0;}))
	{
		throw std::runtime_error("Failed to read disc image.");
	}
	uint32 bytesRead = static_cast<uint32>(MAIN_THREAD_EM_ASM_INT({return Module.discImageDevice.getBytesRead();}));
	m_position += bytesRead;
	return bytesRead;
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
