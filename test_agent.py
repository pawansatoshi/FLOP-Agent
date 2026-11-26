import unittest
from agent import readiness

class GateTests(unittest.TestCase):
    def test_empty(self):
        self.assertFalse(readiness({})["execution_enabled"])
        self.assertEqual(len(readiness({})["missing"]), 5)
    def test_config_cannot_enable_execution(self):
        self.assertFalse(readiness({"network":"testnet","sdk_release":"x","gateway":"x","activation_block":1,"evidence_url":"x","enabled":True})["execution_enabled"])

if __name__ == "__main__":
    unittest.main()
