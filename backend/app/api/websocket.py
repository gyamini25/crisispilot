from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.pubsub import bus

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/stream")
async def stream(ws: WebSocket) -> None:
    await ws.accept()
    queue = await bus.subscribe()
    try:
        while True:
            event = await queue.get()
            await ws.send_text(json.dumps(event))
    except WebSocketDisconnect:
        log.info("WebSocket client disconnected")
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("WebSocket loop failed")
    finally:
        await bus.unsubscribe(queue)
