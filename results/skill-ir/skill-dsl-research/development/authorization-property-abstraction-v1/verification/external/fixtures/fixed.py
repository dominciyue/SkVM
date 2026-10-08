def entry(actor, source, destination):
    if not permitted(actor, destination):
        return False
    perform(actor, destination)
    return True
