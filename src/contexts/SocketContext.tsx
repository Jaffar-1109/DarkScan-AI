import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const { user, token } = useAuth();

  useEffect(() => {
    if (user && token) {
      const newSocket = io(window.location.origin, {
        auth: {
          token
        }
      });
      
      newSocket.on('connect', () => {
        console.log('[Socket] Connected to server');
        newSocket.emit('subscribe', user.id);
        if (user.role === 'admin') {
          newSocket.emit('subscribe', 'admin');
        }
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    } else {
      setSocket(null);
    }
  }, [user, token]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};
