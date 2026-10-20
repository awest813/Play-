#pragma once

#include "Stream.h"
#include <vector>

class CJsDiscImageDeviceStream : public Framework::CStream
{
public:
	virtual ~CJsDiscImageDeviceStream() = default;

	void Seek(int64, Framework::STREAM_SEEK_DIRECTION) override;
	uint64 Tell() override;
	uint64 Read(void*, uint64) override;
	uint64 Write(const void*, uint64) override;
	bool IsEOF() override;
	void Flush() override;

private:
	// One browser round trip fills this many bytes. ISO reads are usually 2048.
	static constexpr uint32 CACHE_BYTES = 256 * 1024;

	uint32 ReadFromDevice(void*, uint32, uint64);
	bool CacheCovers(uint64) const;
	bool FillCache(uint64);

	uint64 m_position = 0;
	uint64 m_cacheOrigin = 0;
	uint32 m_cacheSize = 0;
	std::vector<uint8> m_cache;
};
