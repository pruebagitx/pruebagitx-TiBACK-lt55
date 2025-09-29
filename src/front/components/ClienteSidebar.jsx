import React from 'react';
import useGlobalReducer from '../hooks/useGlobalReducer';

export const ClienteSidebar = ({ sidebarHidden, activeView, changeView }) => {
    const { store } = useGlobalReducer();
    const userData = store.auth.user;

    // Verificar si el usuario es cliente
    if (!userData || userData.role !== 'cliente') {
        return null; // No mostrar sidebar si no es cliente
    }

    return (
        <div className={`hyper-sidebar ${sidebarHidden ? 'hidden' : ''} overflow-auto`} data-hidden={sidebarHidden}>
            <div className="hyper-sidebar-header p-4">
                <a href="#" className="hyper-logo d-flex align-items-center gap-2 text-decoration-none">
                    <i className="fas fa-ticket-alt fs-4"></i>
                    {!sidebarHidden && <span className="fw-bold">TiBACK</span>}
                </a>
            </div>

            <nav className="p-3">
                <div className="mb-4">
                    <div className="hyper-nav-title px-3 mb-2">Navegación</div>
                    <a
                        href="#"
                        className={`hyper-nav-item d-flex align-items-center gap-3 px-3 py-2 rounded text-decoration-none ${activeView === 'dashboard' ? 'active' : ''}`}
                        onClick={(e) => { e.preventDefault(); changeView('dashboard'); }}
                    >
                        <i className="fas fa-tachometer-alt"></i>
                        {!sidebarHidden && <span>Dashboard</span>}
                    </a>
                    <a
                        href="#"
                        className={`hyper-nav-item d-flex align-items-center gap-3 px-3 py-2 rounded text-decoration-none ${activeView === 'tickets' ? 'active' : ''}`}
                        onClick={(e) => { e.preventDefault(); changeView('tickets'); }}
                    >
                        <i className="fas fa-ticket-alt"></i>
                        {!sidebarHidden && <span>Mis Tickets</span>}
                    </a>
                    <a
                        href="#"
                        className={`hyper-nav-item d-flex align-items-center gap-3 px-3 py-2 rounded text-decoration-none ${activeView === 'create' ? 'active' : ''}`}
                        onClick={(e) => { e.preventDefault(); changeView('create'); }}
                    >
                        <i className="fas fa-plus"></i>
                        {!sidebarHidden && <span>Crear Ticket</span>}
                    </a>
                </div>
            </nav>
        </div>
    );
};
