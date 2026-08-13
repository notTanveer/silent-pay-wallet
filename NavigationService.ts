import { createNavigationContainerRef, NavigationAction, ParamListBase, StackActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<ParamListBase>();

let isContainerReady = false;
const readyCallbacks: Array<() => void> = [];

export function markNavigationReady() {
  isContainerReady = true;
  readyCallbacks.splice(0).forEach(callback => callback());
}

export function onNavigationReady(callback: () => void) {
  if (isContainerReady) {
    callback();
  } else {
    readyCallbacks.push(callback);
  }
}

export function navigate(name: string, params?: ParamListBase, options?: { merge: boolean }) {
  if (navigationRef.isReady()) {
    navigationRef.current?.navigate({ name, params, merge: options?.merge });
  }
}

export function dispatch(action: NavigationAction) {
  if (navigationRef.isReady()) {
    navigationRef.current?.dispatch(action);
  }
}

export function reset() {
  if (navigationRef.isReady()) {
    navigationRef.current?.reset({
      index: 0,
      routes: [{ name: 'UnlockWithScreen' }],
    });
  }
}

export function pop() {
  if (navigationRef.isReady()) {
    navigationRef.current?.dispatch(StackActions.pop());
  }
}
