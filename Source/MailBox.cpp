#include "MailBox.h"
#ifdef __EMSCRIPTEN__
#include <emscripten/threading.h>
#endif

bool CMailBox::IsPending() const
{
	return m_calls.size() != 0;
}

void CMailBox::WaitForCall()
{
	std::unique_lock callLock(m_callMutex);
	while(!IsPending())
	{
		m_waitCondition.wait(callLock);
	}
}

void CMailBox::WaitForCall(unsigned int timeOut)
{
	std::unique_lock callLock(m_callMutex);
	if(IsPending()) return;
	m_waitCondition.wait_for(callLock, std::chrono::milliseconds(timeOut));
}

void CMailBox::FlushCalls()
{
	SendCall([]() {}, true);
}

void CMailBox::SendCall(const FunctionType& function, bool waitForCompletion)
{
	std::future<void> future;

	{
		MESSAGE message;
		message.function = function;

		if(waitForCompletion)
		{
			message.promise = std::make_unique<std::promise<void>>();
			future = message.promise->get_future();
		}

		std::lock_guard callLock(m_callMutex);
		m_calls.push_back(std::move(message));
	}

	SignalWaiters();

	if(waitForCompletion)
	{
		future.wait();
	}
}

void CMailBox::SendCall(FunctionType&& function)
{
	{
		MESSAGE message;
		message.function = std::move(function);

		std::lock_guard callLock(m_callMutex);
		m_calls.push_back(std::move(message));
	}

	SignalWaiters();
}

void CMailBox::SignalWaiters()
{
	m_waitCondition.notify_all();
#ifdef __EMSCRIPTEN__
	__atomic_fetch_add(&m_waitSeq, 1, __ATOMIC_SEQ_CST);
	emscripten_futex_wake(&m_waitSeq, 1);
#endif
}

void CMailBox::ReceiveCall()
{
	MESSAGE message;
	{
		std::lock_guard callLock(m_callMutex);
		if(!IsPending()) return;
		message = std::move(m_calls.front());
		m_calls.pop_front();
	}
	message.function();
	if(message.promise)
	{
		message.promise->set_value();
	}
}
