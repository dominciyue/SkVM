"""Derive pre-dispatch counts from a matching original report without rewriting it."""


def observed_consumption_counts(result, claim, report=None):
    matching_zero = (
        result.get('status') == 'provider-unavailable'
        and isinstance(report, dict) and report.get('status') == 'provider-unavailable'
        and type(report.get('providerDispatches')) is int and report['providerDispatches'] == 0
        and all(claim.get(key) is not None and claim[key] == report.get(key) for key in ['inputSha256', 'model'])
    )
    if matching_zero:
        return 0, 0, True
    return result['providerCalls'], result['respondedCalls'], False
