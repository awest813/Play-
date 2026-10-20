#pragma once

#include <functional>
#include "PS2VM.h"

class CSH_OpenAL;

class CPs2VmJs : public CPS2VM
{
public:
	void CreateVM() override;

	// Posts handler setup to the VM thread and returns. afterHandlers runs on
	// that thread once the GS, pad, and sound handlers exist. The page thread
	// is notified through FinishWebStartup.
	void QueueStartup(CSH_OpenAL*, std::function<void()> afterHandlers);

	void BootElf(std::string);
	void BootDiscImage(std::string);

	// Slot 0 is the only slot the page exposes. Each call reports back on the
	// page thread through Module.onStateResult.
	void SaveStateSlot();
	void LoadStateSlot();
	void QueryStateSlot();
};
