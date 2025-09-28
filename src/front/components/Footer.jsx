import { useState } from "react";
import useGlobalReducer from "../hooks/useGlobalReducer";

export const Footer = () => {
	const { store, getRealtimeStatus, startRealtimeSync } = useGlobalReducer();
	const [showDetails, setShowDetails] = useState(false);

	const realtimeStatus = getRealtimeStatus();
	const { isAuthenticated } = store.auth;

	const handleManualSync = () => {
		const syncConfig = startRealtimeSync({
			onSyncTriggered: (data) => {
				console.log('Sincronización activada:', data);
			}
		});
		syncConfig.triggerSync('manual');
	};

	if (!isAuthenticated) {
		return (
			<footer className="footer mt-auto py-4 text-center">
				<h4>"Tu turno, tu tiempo, tu solución. Con la velocidad que mereces."</h4>
			</footer>
		);
	}

	return (
		<footer className="footer mt-auto py-4">
			<div className="container">
				<div className="row">
					<div className="col-md-8">
						<h4>"Tu turno, tu tiempo, tu solución. Con la velocidad que mereces."</h4>
					</div>
					<div className="col-md-4">
						{/* Estado de sincronización compacto */}
						<div className="d-flex align-items-center justify-content-end">
							<div className="me-3">
								<span className={`badge ${realtimeStatus.isConnected ? 'bg-success' : realtimeStatus.isPolling ? 'bg-warning' : 'bg-danger'}`}>
									{realtimeStatus.statusIcon} {realtimeStatus.statusText}
								</span>
								<small className="text-muted ms-2">
									Última sync: {realtimeStatus.lastSyncFormatted}
								</small>
							</div>
							<button
								className="btn btn-sm btn-outline-primary me-2"
								onClick={handleManualSync}
								title="Sincronizar ahora"
							>
								🔄
							</button>
							<button
								className="btn btn-sm btn-outline-secondary"
								onClick={() => setShowDetails(!showDetails)}
								title="Mostrar detalles"
							>
								{showDetails ? '−' : '+'}
							</button>
						</div>

						{/* Detalles expandibles */}
						{showDetails && (
							<div className="mt-3 p-3 bg-light rounded">
								<h6>Estado de Sincronización</h6>
								<div className="row">
									<div className="col-6">
										<small>
											<strong>WebSocket:</strong> {realtimeStatus.isConnected ? 'Conectado' : 'Desconectado'}<br />
											<strong>Polling:</strong> {realtimeStatus.isPolling ? 'Activo' : 'Inactivo'}<br />
											<strong>Notificaciones:</strong> {realtimeStatus.notifications}
										</small>
									</div>
									<div className="col-6">
										<small>
											<strong>Polling activo:</strong> {realtimeStatus.pollingStats.activePolling.join(', ') || 'Ninguno'}<br />
											<strong>Total intervalos:</strong> {realtimeStatus.pollingStats.totalIntervals}<br />
											<strong>Usuario:</strong> {store.auth.user?.role || 'N/A'}
										</small>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		</footer>
	);
};
