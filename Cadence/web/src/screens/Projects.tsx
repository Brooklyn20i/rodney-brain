// The Projects screen lives in ./projects/ — this shim keeps the app's screen
// inventory contract stable while App.tsx imports the lowercase module directly
// to avoid case-collision TypeScript failures on case-insensitive filesystems.
export { Projects } from './projectScreens';
