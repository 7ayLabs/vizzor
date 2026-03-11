import ora from 'ora';
import type { Ora } from 'ora';

/**
 * Starts an ora spinner with the given text.
 */
export function startSpinner(text: string): Ora {
  return ora({ text }).start();
}

/**
 * Stops the spinner and marks it as succeeded with optional replacement text.
 */
export function succeedSpinner(spinner: Ora, text?: string): void {
  spinner.succeed(text);
}

/**
 * Stops the spinner and marks it as failed with optional replacement text.
 */
export function failSpinner(spinner: Ora, text?: string): void {
  spinner.fail(text);
}
