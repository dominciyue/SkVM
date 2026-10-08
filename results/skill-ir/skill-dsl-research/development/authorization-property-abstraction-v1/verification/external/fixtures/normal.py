def entry(actor, source, destination):
    if not permitted(actor, source):
        return False
    perform(actor, source)
    return True
