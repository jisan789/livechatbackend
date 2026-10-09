import asyncio
import threading
from typing import Callable, Any

async def run_in_thread(func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """
    Safely execute a synchronous blocking function in a dedicated thread
    WITHOUT importing or relying on corrupted concurrent.futures modules.
    """
    loop = asyncio.get_running_loop()
    future = loop.create_future()

    def worker():
        try:
            res = func(*args, **kwargs)
            if not future.done():
                loop.call_soon_threadsafe(future.set_result, res)
        except BaseException as exc:
            if not future.done():
                loop.call_soon_threadsafe(future.set_exception, exc)

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    return await future
