# Compara dois rascunhos do Job E por escopo; números com tolerância relativa de 1e-9, o resto exato.
import json, sys, math
def load(p):
    return {(d['scopeType'], d['scopeId']): d for d in json.load(open(p, encoding='utf-8'))}
def same(a, b, path, bad):
    if isinstance(a, float) or isinstance(b, float):
        if not (isinstance(a,(int,float)) and isinstance(b,(int,float)) and math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)): bad.append((path, a, b))
    elif isinstance(a, dict) and isinstance(b, dict):
        if a.keys() != b.keys(): bad.append((path, 'chaves', sorted(set(a)^set(b))))
        for k in a.keys() & b.keys(): same(a[k], b[k], f'{path}.{k}', bad)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b): bad.append((path, 'tamanho', len(a), len(b)))
        else:
            for i,(x,y) in enumerate(zip(a,b)): same(x, y, f'{path}[{i}]', bad)
    elif a != b: bad.append((path, a, b))
A, B = load(sys.argv[1]), load(sys.argv[2])
bad = []
if A.keys() != B.keys(): bad.append(('escopos', sorted(set(A)^set(B))))
for k in A.keys() & B.keys(): same(A[k], B[k], f'{k[0]}:{k[1][:8]}', bad)
print(f'{len(A)} x {len(B)} escopos; {len(bad)} diferenças')
for b in bad[:15]: print(' ', b)
sys.exit(1 if bad else 0)
