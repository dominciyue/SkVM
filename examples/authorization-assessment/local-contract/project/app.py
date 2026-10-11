from fastapi import FastAPI
from outside import PermissionMiddleware
app = FastAPI()
app.add_middleware(PermissionMiddleware)
@app.post("/send")
def request_entry(actor, target):
    return local(actor, target)

def local(actor, target):
    return perform(actor, target)

def perform(who, item):
    if not who.allowed:
        return False
    item.sent = True
    return item
