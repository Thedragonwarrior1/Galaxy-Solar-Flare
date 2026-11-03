"""LZ4-style block compression + base64, matching src/ReplicatedStorage/Shared/Codec.luau."""
from __future__ import annotations

import base64


def lz4_compress(data: bytes) -> bytes:
    n = len(data)
    out = bytearray()
    table: dict[bytes, int] = {}
    anchor = 0
    i = 0

    def write_len(x):
        while x >= 255:
            out.append(255)
            x -= 255
        out.append(x)

    while i + 4 <= n:
        key = data[i:i + 4]
        cand = table.get(key)
        table[key] = i
        if cand is not None and i - cand <= 0xFFFF:
            m = 4
            while i + m < n and data[cand + m] == data[i + m]:
                m += 1
            lit = data[anchor:i]
            ll, ml = len(lit), m - 4
            out.append((min(ll, 15) << 4) | min(ml, 15))
            if ll >= 15:
                write_len(ll - 15)
            out += lit
            off = i - cand
            out.append(off & 0xFF)
            out.append(off >> 8)
            if ml >= 15:
                write_len(ml - 15)
            i += m
            anchor = i
        else:
            i += 1
    lit = data[anchor:]
    ll = len(lit)
    out.append(min(ll, 15) << 4)
    if ll >= 15:
        write_len(ll - 15)
    out += lit
    return bytes(out)


def lz4_decompress(src: bytes, size: int) -> bytes:
    """Reference decoder (used by the build's self-check)."""
    dst = bytearray()
    ip = 0
    while ip < len(src):
        tok = src[ip]
        ip += 1
        ll = tok >> 4
        if ll == 15:
            while True:
                b = src[ip]
                ip += 1
                ll += b
                if b != 255:
                    break
        dst += src[ip:ip + ll]
        ip += ll
        if ip >= len(src):
            break
        off = src[ip] | (src[ip + 1] << 8)
        ip += 2
        ml = tok & 15
        if ml == 15:
            while True:
                b = src[ip]
                ip += 1
                ml += b
                if b != 255:
                    break
        ml += 4
        start = len(dst) - off
        for k in range(ml):
            dst.append(dst[start + k])
    assert len(dst) == size, (len(dst), size)
    return bytes(dst)


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")
