"""Preload deterministic HTTP and scheduler definitions into the deployment snapshot.

Never construct an application, resolve bindings or execute a task here.
"""
from worker_runtime import http_snapshot
from backend.app.adapters.d1.sql import D1SQL
from backend.app.native import site_sync_dispatch,site_sync_recovery
from worker_runtime.bridge import Environment
from worker_runtime import cron_health
