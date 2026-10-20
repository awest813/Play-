#pragma once

#include <emscripten/html5.h>
#include "gs/GSH_OpenGL/GSH_OpenGL.h"

class CGSH_OpenGLJs : public CGSH_OpenGL
{
public:
	// DOM id of the picture element. initVm transfers this to the GS thread.
	static const char* CanvasTarget()
	{
		return "#outputCanvas";
	}

	CGSH_OpenGLJs() = default;
	virtual ~CGSH_OpenGLJs() = default;

	static FactoryFunction GetFactoryFunction();

	void InitializeImpl() override;
	void ReleaseImpl() override;
	void PresentBackbuffer() override;

private:
	EMSCRIPTEN_WEBGL_CONTEXT_HANDLE m_context = 0;
};
