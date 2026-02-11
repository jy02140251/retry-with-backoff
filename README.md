# Retry With Backoff

Async retry utility with exponential backoff, jitter, and circuit breaker pattern. Zero dependencies.

## Features

- Exponential backoff with jitter
- Circuit breaker pattern
- Configurable retry conditions
- TypeScript support
- Zero dependencies
- Abort signal support

## Installation

```bash
npm install retry-with-backoff
```

## Quick Start

```typescript
import { retry, CircuitBreaker } from 'retry-with-backoff';

// Simple retry
const result = await retry(async () => {
  const response = await fetch('https://api.example.com/data');
  if (!response.ok) throw new Error('Failed');
  return response.json();
});

// With options
const data = await retry(
  async () => fetchData(),
  {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    jitter: true,
    retryCondition: (error) => error.status !== 404,
    onRetry: (error, attempt) => console.log(`Retry ${attempt}:`, error.message),
  }
);

// Circuit breaker
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
});

const result = await breaker.execute(() => fetchData());
```

## API Reference

### `retry(fn, options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRetries` | number | `3` | Maximum retry attempts |
| `initialDelay` | number | `1000` | Initial delay in ms |
| `maxDelay` | number | `30000` | Maximum delay in ms |
| `backoffFactor` | number | `2` | Backoff multiplier |
| `jitter` | boolean | `true` | Add random jitter |
| `retryCondition` | function | `() => true` | Should retry? |
| `onRetry` | function | `undefined` | Called on each retry |
| `signal` | AbortSignal | `undefined` | Abort signal |

### `CircuitBreaker`

```typescript
const breaker = new CircuitBreaker({
  failureThreshold: 5,  // Open after 5 failures
  resetTimeout: 30000,  // Try again after 30s
  halfOpenMax: 3,       // Max concurrent in half-open state
});

// Check state
breaker.state; // 'closed' | 'open' | 'half-open'

// Execute with circuit breaker
await breaker.execute(() => riskyOperation());

// Manual control
breaker.reset();
```

## Examples

### With Fetch

```typescript
const fetchWithRetry = (url: string) =>
  retry(
    async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    {
      maxRetries: 3,
      retryCondition: (error) => {
        // Don't retry 4xx errors
        const status = error.message.match(/HTTP (\d+)/)?.[1];
        return !status || parseInt(status) >= 500;
      },
    }
  );
```

### With Abort

```typescript
const controller = new AbortController();

// Cancel after 10 seconds
setTimeout(() => controller.abort(), 10000);

try {
  await retry(() => slowOperation(), {
    signal: controller.signal,
  });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Operation was cancelled');
  }
}
```

## License

MIT