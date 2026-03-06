"""
Deterministic RNG — XorShift32.

Portable across Python versions and architectures.
Same seed string → same sequence of integers, always.
"""
import hashlib


class DetRNG:
    """XorShift32 deterministic PRNG."""

    MASK = 0xFFFFFFFF

    def __init__(self, seed_str: str):
        h = hashlib.sha256(seed_str.encode("utf-8")).hexdigest()
        self.state = int(h[:8], 16) | 1  # never 0

    def _next(self) -> int:
        x = self.state
        x ^= (x << 13) & self.MASK
        x ^= (x >> 17)
        x ^= (x << 5) & self.MASK
        self.state = x & self.MASK
        return self.state

    def randint(self, lo: int, hi: int) -> int:
        """Inclusive [lo, hi]."""
        assert hi >= lo, f"randint: hi ({hi}) < lo ({lo})"
        span = hi - lo + 1
        return lo + (self._next() % span)

    def choice(self, seq: list):
        """Pick a random element from a non-empty sequence."""
        assert len(seq) > 0, "choice from empty seq"
        return seq[self._next() % len(seq)]

    def random_permil(self) -> int:
        """Return 0..999 (equivalent to random() * 1000 truncated)."""
        return self._next() % 1000

    def shuffle(self, seq: list) -> list:
        """Return a new shuffled list (Fisher-Yates, deterministic)."""
        out = list(seq)
        for i in range(len(out) - 1, 0, -1):
            j = self._next() % (i + 1)
            out[i], out[j] = out[j], out[i]
        return out
