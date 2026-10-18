#pragma once

#include "input/InputProvider.h"
#include <emscripten/html5.h>
#include <string>
#include <vector>

class CInputProviderEmscripten : public CInputProvider
{
public:
	uint32 GetId() const override;
	std::string GetTargetDescription(const BINDINGTARGET&) const override;

	static BINDINGTARGET MakeBindingTarget(const EM_UTF8* code);

	void OnKeyDown(const EM_UTF8*);
	void OnKeyUp(const EM_UTF8*);
	// Drop every key that is still down. The canvas does not receive keyup
	// after it loses focus or the tab is hidden.
	void ReleasePressedKeys();

private:
	std::vector<std::string> m_pressedCodes;
};
