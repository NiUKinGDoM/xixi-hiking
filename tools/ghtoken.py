#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
tools/ghtoken.py — 从 Windows 凭据管理器读 GitHub token（stdout 只输出 token）
2026-09-10 建：把每轮手抄的 ctypes 取 token 代码收进一个文件，供 tools/ghsync.js 调用。
铁律（踩坑换来的）：必须用 CredEnumerate 枚举过滤 `git:https://github.com`；
CredReadW 读该 target 返回空 blob；blob 是 UTF-16LE、40 字符裸 token（无 x-access-token 前缀）。
"""
import ctypes
import ctypes.wintypes as wt
import sys


class CRED(ctypes.Structure):
    _fields_ = [
        ('Flags', wt.DWORD), ('Type', wt.DWORD), ('TargetName', ctypes.c_wchar_p),
        ('Comment', ctypes.c_wchar_p), ('LastWritten', wt.FILETIME),
        ('CredentialBlobSize', wt.DWORD),
        ('CredentialBlob', ctypes.POINTER(ctypes.c_ubyte)),
        ('TargetAlias', ctypes.c_wchar_p), ('UserName', ctypes.c_wchar_p),
        ('ProtectType', wt.DWORD),
    ]


def main():
    adv = ctypes.windll.advapi32
    count = wt.DWORD(0)
    pcred = ctypes.POINTER(ctypes.POINTER(CRED))()
    if not adv.CredEnumerateW(None, 0, ctypes.byref(count), ctypes.byref(pcred)):
        sys.stderr.write('CredEnumerateW 失败\n')
        return 1
    for i in range(count.value):
        c = pcred[i].contents
        if c.TargetName and 'git:https://github.com' in c.TargetName and c.CredentialBlob and c.CredentialBlobSize:
            tok = ctypes.string_at(c.CredentialBlob, c.CredentialBlobSize).decode('utf-16-le').strip()
            if tok.startswith('ghp_') or tok.startswith('github_pat_'):
                sys.stdout.write(tok)
                return 0
    sys.stderr.write('未找到 git:https://github.com 的 token\n')
    return 1


if __name__ == '__main__':
    sys.exit(main())
