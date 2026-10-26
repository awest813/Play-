#pragma once

//Include this file in your app's main.cpp file to obtain a default AppConfig base path.

#include "PathUtils.h"
#include "AppConfig.h"

// The directory only. Calling this does not construct CAppConfig, whose
// constructor reads config.xml from this path.
inline fs::path PlayDataPath()
{
	static const char* BASE_DATA_PATH = "Play Data Files";
	static const auto basePath =
	    []() {
		    auto result = Framework::PathUtils::GetPersonalDataPath() / BASE_DATA_PATH;
		    Framework::PathUtils::EnsurePathExists(result);
		    return result;
	    }();
	return basePath;
}

fs::path CAppConfig::GetBasePath() const
{
	return PlayDataPath();
}
