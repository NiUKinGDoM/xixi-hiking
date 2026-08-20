# -*- coding: utf-8 -*-
import re, sys

path = r'C:\Users\NIU-XC\Desktop\buddy\2026-08-07-13-58-04\hiking-app3\www\index.html'
text = open(path, encoding='utf-8').read()

func_names = ['testSearchFunction','testAPIAvailability','scheduleCacheCleanup','cleanExpiredCache','handleSearchInput',
              'showRouteMap','showRouteModal','searchMountainRoute','displayRouteData','displayDefaultRoute',
              'setupCanvasInteraction','drawRouteMap','generateSingleRouteWithScenicSpots',
              'generateUniqueRoutePoints','updateMountainData','loadFromStorage',
              'loadDarkModeFromStorage','loadTitleFromStorage','loadStatsTitleFromStorage','loadRecordsTitleFromStorage',
              'loadPlannedTitleFromStorage','loadSettingsTitleFromStorage']

pattern = re.compile(r'(?:async\s+)?function\s+(\w+)\s*\(')
ranges = []
for m in pattern.finditer(text):
    name = m.group(1)
    if name not in func_names:
        continue
    brace = text.find('{', m.end())
    if brace == -1:
        continue
    depth = 0
    i = brace
    in_str = None
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == '\\':
                i += 2
                continue
            if ch == in_str:
                in_str = None
        else:
            if ch in ("'", '"', '`'):
                in_str = ch
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    ranges.append((m.start(), i + 1, name))
                    break
        i += 1

for start, end, name in sorted(ranges, reverse=True):
    text = text[:start] + text[end:]

open(path, 'w', encoding='utf-8').write(text)
print('removed functions:', len(ranges))
