import unittest
from ordinary_accounting_support import observed_consumption_counts


class PreDispatchAccountingTest(unittest.TestCase):
    def test_matching_pre_dispatch_report_recovers_only_counts(self):
        result = {'status': 'provider-unavailable', 'providerCalls': None, 'respondedCalls': None}
        claim = {'inputSha256': 'original-bytes', 'model': 'configured/model'}
        report = {**claim, 'status': 'provider-unavailable', 'providerDispatches': 0}
        self.assertEqual(observed_consumption_counts(result, claim, report), (0, 0, True))
        self.assertIsNone(result['providerCalls'])

    def test_missing_mismatched_or_unknown_report_never_invents_zero(self):
        result = {'status': 'provider-unavailable', 'providerCalls': None, 'respondedCalls': None}
        claim = {'inputSha256': 'original-bytes', 'model': 'configured/model'}
        report = {**claim, 'status': 'provider-unavailable', 'providerDispatches': 0}
        for altered in [None, {**report, 'model': 'different'}, {**report, 'inputSha256': 'different'}, {**report, 'status': 'timeout-unknown'}, {**report, 'providerDispatches': False}, {**report, 'providerDispatches': None}]:
            self.assertEqual(observed_consumption_counts(result, claim, altered), (None, None, False))

    def test_actual_calls_keep_responded_counts_and_unknown_completion(self):
        result = {'status': 'timeout-unknown', 'providerCalls': 11, 'respondedCalls': 10}
        self.assertEqual(observed_consumption_counts(result, {}, {'status': 'provider-unavailable', 'providerDispatches': 0}), (11, 10, False))


if __name__ == '__main__':
    unittest.main()
