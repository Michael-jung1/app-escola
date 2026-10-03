import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Algo deu errado</h1>
          <p className="text-slate-400 text-sm max-w-md mb-6">
            Ocorreu um erro inesperado ao carregar a página. Tente recarregar para continuar.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-xl transition-colors shadow-lg flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Recarregar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
