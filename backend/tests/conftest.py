import os
import sys

# Tests import `services.*` exactly like main.py does.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
