#pragma once

#include "PS2VM.h"

class CPs2VmJs : public CPS2VM
{
public:
	void CreateVM() override;

	void BootElf(std::string);
	void BootDiscImage(std::string);

	// Slot 0 is the only slot the page exposes. Each call reports back on the
	// page thread through Module.onStateResult.
	void SaveStateSlot();
	void LoadStateSlot();
	void QueryStateSlot();
};
