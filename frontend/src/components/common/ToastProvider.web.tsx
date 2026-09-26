import React from 'react';
import { Toaster } from 'react-hot-toast';
import { AppMessageProvider } from './AppMessageProvider';

export const ToastProvider = () => (
	<>
		<AppMessageProvider />
		<Toaster position="top-right" />
	</>
);
