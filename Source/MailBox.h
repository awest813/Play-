#pragma once

#include <functional>
#include <deque>
#include <mutex>
#include <condition_variable>
#include <future>

class CMailBox
{
public:
	virtual ~CMailBox() = default;

	typedef std::function<void()> FunctionType;

	void SendCall(const FunctionType&, bool = false);
	void SendCall(FunctionType&&);
	void FlushCalls();

	bool IsPending() const;
	void ReceiveCall();
	void WaitForCall();
	void WaitForCall(unsigned int);
#ifdef __EMSCRIPTEN__
	// The GS worker waits on this with Atomics.waitAsync. Atomics.wait would
	// freeze that worker, and Chrome does not present its OffscreenCanvas
	// until the worker returns to the event loop.
	unsigned int* WaitSeqPtr()
	{
		return &m_waitSeq;
	}
#endif

private:
	void SignalWaiters();
	struct MESSAGE
	{
		MESSAGE() = default;

		MESSAGE(MESSAGE&&) = default;
		MESSAGE(const MESSAGE&) = delete;

		MESSAGE& operator=(MESSAGE&&) = default;
		MESSAGE& operator=(const MESSAGE&) = delete;

		FunctionType function;
		std::unique_ptr<std::promise<void>> promise;
	};

	typedef std::deque<MESSAGE> FunctionCallQueue;

	FunctionCallQueue m_calls;
	std::mutex m_callMutex;
	std::condition_variable m_waitCondition;
#ifdef __EMSCRIPTEN__
	unsigned int m_waitSeq = 0;
#endif
};
