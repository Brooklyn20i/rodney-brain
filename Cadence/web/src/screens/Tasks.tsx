// The Tasks hub lives in ./tasks/ — this shim keeps App.tsx's lazy import path
// (and every test import) stable across the redesign.
export { Tasks } from './tasks';
