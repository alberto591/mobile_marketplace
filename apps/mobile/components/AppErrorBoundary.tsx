import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, spacing } from '../theme/index';

interface Props {
  readonly children: React.ReactNode;
  /** Hook for crash reporting (e.g. Sentry) once one is configured. */
  readonly onError?: (error: Error, componentStack: string) => void;
}

interface State {
  readonly error: Error | null;
  /** Changing the key remounts the whole tree on retry. */
  readonly attempt: number;
}

/**
 * Last line of defence for render errors anywhere in the app, including the providers:
 * shows a recovery screen instead of a blank or closed app. The cart, saved parts and
 * order history live in device storage, so they survive the retry.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.props.onError?.(error, info.componentStack ?? '');
  }

  private readonly retry = () => {
    this.setState((prev) => ({ error: null, attempt: prev.attempt + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.screen} accessibilityRole="alert">
          <Text style={styles.title}>Algo ha fallado</Text>
          <Text style={styles.message}>
            La aplicación ha tenido un problema inesperado. Tu carrito y tus pedidos están a salvo.
          </Text>
          <Pressable style={styles.button} onPress={this.retry} accessibilityRole="button">
            <Text style={styles.buttonText}>Volver a intentarlo</Text>
          </Pressable>
          {this.state.attempt > 0 && (
            <Text style={styles.hint}>Si el problema continúa, cierra la aplicación y vuelve a abrirla.</Text>
          )}
        </View>
      );
    }

    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.huge,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 420,
  },
  button: {
    marginTop: spacing.xxl,
    minHeight: 48,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    marginTop: spacing.lg,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
