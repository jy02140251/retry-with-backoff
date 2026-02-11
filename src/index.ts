export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  jitter?: boolean;
  retryCondition?: (error: Error, attempt: number) => boolean | Promise<boolean>;
  onRetry?: (error: Error, attempt: number, delay: number) => void;
  signal?: AbortSignal;
}

const defaultOptions: Required<Omit<RetryOptions, 'onRetry' | 'signal' | 'retryCondition'>> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  jitter: true,
};

function calculateDelay(attempt: number, options: Required<Omit<RetryOptions, 'onRetry' | 'signal' | 'retryCondition'>>): number {
  const exponentialDelay = options.initialDelay * Math.pow(options.backoffFactor, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelay);
  
  if (options.jitter) {
    // Add random jitter between 0-100% of delay
    return cappedDelay * (0.5 + Math.random() * 0.5);
  }
  
  return cappedDelay;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timeout = setTimeout(resolve, ms);
    
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  const { maxRetries, signal, onRetry, retryCondition } = opts;

  let lastError: Error = new Error('Retry failed');
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt > maxRetries) {
        throw lastError;
      }

      // Check retry condition
      if (retryCondition) {
        const shouldRetry = await retryCondition(lastError, attempt);
        if (!shouldRetry) {
          throw lastError;
        }
      }

      const delay = calculateDelay(attempt, opts);
      onRetry?.(lastError, attempt, delay);
      
      await sleep(delay, signal);
    }
  }

  throw lastError;
}

// Circuit Breaker
type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMax?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private halfOpenCount = 0;
  
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly halfOpenMax: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.halfOpenMax = options.halfOpenMax ?? 3;
  }

  get currentState(): CircuitState {
    if (this.state === 'open' && Date.now() - this.lastFailureTime >= this.resetTimeout) {
      this.state = 'half-open';
      this.halfOpenCount = 0;
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.currentState;

    if (state === 'open') {
      throw new Error('Circuit breaker is open');
    }

    if (state === 'half-open' && this.halfOpenCount >= this.halfOpenMax) {
      throw new Error('Circuit breaker half-open limit reached');
    }

    if (state === 'half-open') {
      this.halfOpenCount++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
    this.halfOpenCount = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.halfOpenCount = 0;
  }
}

// Utility: Retry with circuit breaker
export function createResilientFunction<T>(
  fn: () => Promise<T>,
  retryOptions: RetryOptions = {},
  breakerOptions: CircuitBreakerOptions = {}
): () => Promise<T> {
  const breaker = new CircuitBreaker(breakerOptions);
  
  return () => breaker.execute(() => retry(fn, retryOptions));
}

export default retry;