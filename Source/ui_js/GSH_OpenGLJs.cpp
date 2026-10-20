#include "GSH_OpenGLJs.h"
#include <cstdio>
#include <cstdlib>

CGSH_OpenGL::FactoryFunction CGSH_OpenGLJs::GetFactoryFunction()
{
	return []() { return new CGSH_OpenGLJs(); };
}

void CGSH_OpenGLJs::InitializeImpl()
{
	// This runs on the GS thread, which already owns the transferred canvas.
	// Explicit swap matches OffscreenCanvas: the page thread no longer presents
	// the frame when a proxied GL call returns.
	EmscriptenWebGLContextAttributes attr;
	emscripten_webgl_init_context_attributes(&attr);
	attr.majorVersion = 2;
	attr.minorVersion = 0;
	attr.alpha = false;
	attr.explicitSwapControl = true;
	attr.proxyContextToMainThread = EMSCRIPTEN_WEBGL_CONTEXT_PROXY_DISALLOW;
	attr.renderViaOffscreenBackBuffer = false;

	m_context = emscripten_webgl_create_context(CanvasTarget(), &attr);
	if(m_context <= 0)
	{
		printf("Failed to create a WebGL2 context on the GS thread.\n");
		abort();
	}

	EMSCRIPTEN_RESULT result = emscripten_webgl_make_context_current(m_context);
	if(result != EMSCRIPTEN_RESULT_SUCCESS)
	{
		printf("Failed to activate the GS WebGL context (%d).\n", result);
		abort();
	}

	CGSH_OpenGL::InitializeImpl();
}

void CGSH_OpenGLJs::ReleaseImpl()
{
	CGSH_OpenGL::ReleaseImpl();
	if(m_context != 0)
	{
		emscripten_webgl_make_context_current(0);
		emscripten_webgl_destroy_context(m_context);
		m_context = 0;
	}
}

void CGSH_OpenGLJs::PresentBackbuffer()
{
	// commit_frame is a no-op in Emscripten 4.0.1. The GS pump yields after
	// this so Chrome can composite the worker canvas.
	emscripten_webgl_commit_frame();
	CGSHandler::NoteOffscreenPresent();
}
