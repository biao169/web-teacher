"""Compatibility entry point; current baseline integration staging."""
from stage_release_v016001 import *

if __name__=="__main__":
    import runpy
    runpy.run_module("stage_release_v016001",run_name="__main__")
