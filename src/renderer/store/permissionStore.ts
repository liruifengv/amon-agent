// Permission store - disabled for pi-agent-core refactor (first phase does not implement permissions)
// This file is kept as a placeholder for future permission support.

import { create } from 'zustand';

interface PermissionState {
  // Placeholder - no active permission state in first phase
}

export const usePermissionStore = create<PermissionState>(() => ({}));
