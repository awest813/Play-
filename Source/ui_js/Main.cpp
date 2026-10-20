#include <cstdio>
#include <emscripten/bind.h>
#include "Ps2VmJs.h"
#include "GSH_OpenGLJs.h"
#include "sound/SH_OpenAL/SH_OpenALProxy.h"
#include "input/PH_GenericInput.h"
#include "InputProviderEmscripten.h"
#include "ui_shared/StatsManager.h"
#include "DefaultAppConfig.h"

CPs2VmJs* g_virtualMachine = nullptr;
CGSHandler::NewFrameEvent::Connection g_gsNewFrameConnection;
std::shared_ptr<CInputProviderEmscripten> g_inputProvider;
CSH_OpenAL* g_soundHandler = nullptr;

int main(int argc, const char** argv)
{
	printf("Play! - Version %s\r\n", PLAY_VERSION);
	return 0;
}

EM_BOOL keyboardCallback(int eventType, const EmscriptenKeyboardEvent* keyEvent, void* userData)
{
	if(!g_inputProvider || keyEvent->repeat)
	{
		return true;
	}
	switch(eventType)
	{
	case EMSCRIPTEN_EVENT_KEYDOWN:
		g_inputProvider->OnKeyDown(keyEvent->code);
		break;
	case EMSCRIPTEN_EVENT_KEYUP:
		g_inputProvider->OnKeyUp(keyEvent->code);
		break;
	}
	return true;
}

EM_BOOL focusCallback(int eventType, const EmscriptenFocusEvent*, void*)
{
	if(eventType == EMSCRIPTEN_EVENT_BLUR && g_inputProvider)
	{
		g_inputProvider->ReleasePressedKeys();
	}
	return false;
}

EM_BOOL visibilityCallback(int eventType, const EmscriptenVisibilityChangeEvent* visibilityEvent, void*)
{
	if(eventType == EMSCRIPTEN_EVENT_VISIBILITYCHANGE && visibilityEvent->hidden && g_inputProvider)
	{
		g_inputProvider->ReleasePressedKeys();
	}
	return false;
}

extern "C" void initVm()
{
	// Hand the picture to the GS thread before anything blocks the page thread.
	// CreateGSHandler waits on the emulator thread, and a canvas can only be
	// transferred while the calling thread is still pumping messages.
	CGSHandler::PrepareOffscreenThread(CGSH_OpenGLJs::CanvasTarget());

	g_virtualMachine = new CPs2VmJs();
	g_virtualMachine->Initialize();
	g_virtualMachine->CreateGSHandler(CGSH_OpenGLJs::GetFactoryFunction());

	{
		//Size here needs to match the size of the canvas in HTML file.

		CGSHandler::PRESENTATION_PARAMS presentationParams;
		presentationParams.mode = CGSHandler::PRESENTATION_MODE_FIT;
		presentationParams.windowWidth = 640;
		presentationParams.windowHeight = 480;

		g_virtualMachine->m_ee->m_gs->SetPresentationParams(presentationParams);
	}

	{
		g_virtualMachine->CreatePadHandler(CPH_GenericInput::GetFactoryFunction());
		auto padHandler = static_cast<CPH_GenericInput*>(g_virtualMachine->GetPadHandler());
		auto& bindingManager = padHandler->GetBindingManager();

		g_inputProvider = std::make_shared<CInputProviderEmscripten>();
		bindingManager.RegisterInputProvider(g_inputProvider);

		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::START, CInputProviderEmscripten::MakeBindingTarget("Enter"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::SELECT, CInputProviderEmscripten::MakeBindingTarget("Backspace"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::DPAD_LEFT, CInputProviderEmscripten::MakeBindingTarget("ArrowLeft"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::DPAD_RIGHT, CInputProviderEmscripten::MakeBindingTarget("ArrowRight"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::DPAD_UP, CInputProviderEmscripten::MakeBindingTarget("ArrowUp"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::DPAD_DOWN, CInputProviderEmscripten::MakeBindingTarget("ArrowDown"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::SQUARE, CInputProviderEmscripten::MakeBindingTarget("KeyA"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::CROSS, CInputProviderEmscripten::MakeBindingTarget("KeyZ"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::TRIANGLE, CInputProviderEmscripten::MakeBindingTarget("KeyS"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::CIRCLE, CInputProviderEmscripten::MakeBindingTarget("KeyX"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::L1, CInputProviderEmscripten::MakeBindingTarget("Digit1"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::L2, CInputProviderEmscripten::MakeBindingTarget("Digit2"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::L3, CInputProviderEmscripten::MakeBindingTarget("Digit3"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::R1, CInputProviderEmscripten::MakeBindingTarget("Digit8"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::R2, CInputProviderEmscripten::MakeBindingTarget("Digit9"));
		bindingManager.SetSimpleBinding(0, PS2::CControllerInfo::R3, CInputProviderEmscripten::MakeBindingTarget("Digit0"));

		bindingManager.SetSimulatedAxisBinding(0, PS2::CControllerInfo::ANALOG_LEFT_X,
		                                       CInputProviderEmscripten::MakeBindingTarget("KeyF"),
		                                       CInputProviderEmscripten::MakeBindingTarget("KeyH"));
		bindingManager.SetSimulatedAxisBinding(0, PS2::CControllerInfo::ANALOG_LEFT_Y,
		                                       CInputProviderEmscripten::MakeBindingTarget("KeyT"),
		                                       CInputProviderEmscripten::MakeBindingTarget("KeyG"));

		bindingManager.SetSimulatedAxisBinding(0, PS2::CControllerInfo::ANALOG_RIGHT_X,
		                                       CInputProviderEmscripten::MakeBindingTarget("KeyJ"),
		                                       CInputProviderEmscripten::MakeBindingTarget("KeyL"));
		bindingManager.SetSimulatedAxisBinding(0, PS2::CControllerInfo::ANALOG_RIGHT_Y,
		                                       CInputProviderEmscripten::MakeBindingTarget("KeyI"),
		                                       CInputProviderEmscripten::MakeBindingTarget("KeyK"));
	}

	{
		g_soundHandler = new CSH_OpenAL();
		g_virtualMachine->CreateSoundHandler(CSH_OpenALProxy::GetFactoryFunction(g_soundHandler));
	}

	g_gsNewFrameConnection = g_virtualMachine->GetGSHandler()->OnNewFrame.Connect(std::bind(&CStatsManager::OnGsNewFrame, &CStatsManager::GetInstance(), std::placeholders::_1));

	EMSCRIPTEN_RESULT result = EMSCRIPTEN_RESULT_SUCCESS;

	result = emscripten_set_keydown_callback("#outputCanvas", nullptr, false, &keyboardCallback);
	assert(result == EMSCRIPTEN_RESULT_SUCCESS);

	result = emscripten_set_keyup_callback("#outputCanvas", nullptr, false, &keyboardCallback);
	assert(result == EMSCRIPTEN_RESULT_SUCCESS);

	result = emscripten_set_blur_callback("#outputCanvas", nullptr, false, &focusCallback);
	assert(result == EMSCRIPTEN_RESULT_SUCCESS);

	result = emscripten_set_blur_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW, nullptr, false, &focusCallback);
	assert(result == EMSCRIPTEN_RESULT_SUCCESS);

	result = emscripten_set_visibilitychange_callback(nullptr, false, &visibilityCallback);
	assert(result == EMSCRIPTEN_RESULT_SUCCESS);

	// Preferences were loaded from the mounted config.xml. Write them back so
	// the page can store the file in IndexedDB.
	try
	{
		CAppConfig::GetInstance().Save();
	}
	catch(...)
	{
	}
}

void bootElf(std::string path)
{
	g_virtualMachine->BootElf(path);
}

void bootDiscImage(std::string path)
{
	g_virtualMachine->BootDiscImage(path);
}

int getFrames()
{
	return CStatsManager::GetInstance().GetFrames();
}

int bootReportsResult()
{
	return 1;
}

std::string persistentDataPath()
{
	// Creates the personal-data directory in MEMFS. The page mounts IDBFS here
	// and loads IndexedDB before initVm. CAppConfig must not be constructed
	// yet: its constructor reads config.xml, which has to come from that mount.
	return PlayDataPath().string();
}

void saveStateSlot()
{
	g_virtualMachine->SaveStateSlot();
}

void loadStateSlot()
{
	g_virtualMachine->LoadStateSlot();
}

void queryStateSlot()
{
	g_virtualMachine->QueryStateSlot();
}

int stateReportsResult()
{
	return 1;
}

void clearStats()
{
	CStatsManager::GetInstance().ClearStats();
}

EMSCRIPTEN_BINDINGS(Play)
{
	using namespace emscripten;

	function("bootElf", &bootElf);
	function("bootDiscImage", &bootDiscImage);
	function("getFrames", &getFrames);
	function("clearStats", &clearStats);
	function("bootReportsResult", &bootReportsResult);
	function("persistentDataPath", &persistentDataPath);
	function("saveStateSlot", &saveStateSlot);
	function("loadStateSlot", &loadStateSlot);
	function("queryStateSlot", &queryStateSlot);
	function("stateReportsResult", &stateReportsResult);
}
