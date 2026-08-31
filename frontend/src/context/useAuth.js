import { useContext } from 'react';
import { AuthContext } from './authContextInstance';

export const useAuth = () => useContext(AuthContext);
