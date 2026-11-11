import ctypes
import os
from pathlib import Path
import platform
import shutil
import subprocess
from .db import ROOT, now
from .codex import codex_command, environment


def inspect_machine():
    ram = None
    if os.name=='nt':
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [('dwLength',ctypes.c_ulong),('dwMemoryLoad',ctypes.c_ulong)]+[(k,ctypes.c_ulonglong) for k in ['ullTotalPhys','ullAvailPhys','ullTotalPageFile','ullAvailPageFile','ullTotalVirtual','ullAvailVirtual','ullAvailExtendedVirtual']]
        status = MEMORYSTATUSEX()
        status.dwLength = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)): ram = round(status.ullTotalPhys/1024**3,2)
    elif Path('/proc/meminfo').exists():
        ram = round(int(Path('/proc/meminfo').read_text().splitlines()[0].split()[1])/1024**2,2)
    result = {'observed_at':now(),'os':platform.platform(),'cpu':platform.processor() or platform.machine(),'ram_gib':ram,'python':platform.python_version(),'windows_verified':os.name=='nt','tools':{}}
    for tool in ['git','node','codex','ffmpeg']:
        binary = shutil.which(tool)
        if binary:
            try:
                command = codex_command(binary) if tool=='codex' else [binary]
                run = subprocess.run(command+['-version' if tool=='ffmpeg' else '--version'],capture_output=True,text=True,encoding='utf-8',timeout=10,env=environment())
                result['tools'][tool] = {'available':run.returncode==0,'version':(run.stdout or run.stderr).splitlines()[0][:200]}
            except (OSError,RuntimeError,subprocess.TimeoutExpired): result['tools'][tool] = {'available':False}
        else: result['tools'][tool] = {'available':False}
    user_skill = Path.home()/'.agents/skills/caveman/SKILL.md'
    result['caveman'] = {'installed_for_user':user_skill.is_file(),'bundled':(ROOT/'skills/caveman/SKILL.md').is_file(),'source':'JuliusBrussee/caveman; pinned source in skills/caveman/source.json'}
    if shutil.which('codex'):
        try:
            run = subprocess.run(codex_command()+['mcp','list'],capture_output=True,text=True,encoding='utf-8',timeout=15,env=environment())
            result['mcp'] = {'has_configured_servers':'No MCP servers configured' not in run.stdout and bool(run.stdout.strip()),'note':'Saída completa omitida para não registrar credenciais. Plugins deste chat não se transferem para o CLI.'}
        except (OSError,RuntimeError,subprocess.TimeoutExpired): result['mcp'] = {'state':'UNAVAILABLE'}
    return result
