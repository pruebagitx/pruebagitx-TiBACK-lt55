import { useState, useEffect } from "react";
import useGlobalReducer from "../hooks/useGlobalReducer";

export const Footer = () => {
	const { store, getRealtimeStatus, startRealtimeSync, joinAllCriticalRooms } = useGlobalReducer();
	const [showDetails, setShowDetails] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);

	const realtimeStatus = getRealtimeStatus();
	const { isAuthenticated } = store.auth;

	// Debug: Monitorear cambios en el estado de autenticación
	useEffect(() => {
		console.log('🔍 Footer - Estado de autenticación actualizado:', {
			isAuthenticated: store.auth.isAuthenticated,
			hasUser: !!store.auth.user,
			hasToken: !!store.auth.token,
			userRole: store.auth.user?.role,
			userId: store.auth.user?.id
		});
	}, [store.auth.isAuthenticated, store.auth.user, store.auth.token]);

	const handleManualSync = async () => {
		if (isSyncing) {
			console.log('⏳ Sincronización ya en progreso...');
			return;
		}

		try {
			setIsSyncing(true);
			console.log('🔄 Iniciando sincronización manual desde Footer...');

			// Debug: Verificar estado de autenticación
			console.log('🔍 Estado de autenticación:', {
				isAuthenticated: store.auth.isAuthenticated,
				hasUser: !!store.auth.user,
				hasToken: !!store.auth.token,
				userRole: store.auth.user?.role,
				userId: store.auth.user?.id
			});

			// Verificar que tenemos los datos necesarios
			// Permitir sincronización si está autenticado y tiene token, incluso si user aún no está cargado
			if (!store.auth.isAuthenticated || !store.auth.token) {
				console.warn('⚠️ No hay usuario autenticado para sincronizar:', {
					isAuthenticated: store.auth.isAuthenticated,
					hasUser: !!store.auth.user,
					hasToken: !!store.auth.token
				});
				return;
			}

			// Si no hay objeto user pero sí hay token, intentar obtenerlo del token
			let userData = store.auth.user;
			if (!userData && store.auth.token) {
				console.log('🔄 Objeto user no disponible, intentando obtener datos del token...');
				try {
					// Decodificar el token para obtener información del usuario
					const tokenPayload = JSON.parse(atob(store.auth.token.split('.')[1]));
					userData = {
						id: tokenPayload.user_id,
						role: tokenPayload.role,
						email: tokenPayload.email
					};
					console.log('✅ Datos de usuario obtenidos del token:', userData);
				} catch (error) {
					console.error('❌ Error decodificando token:', error);
					return;
				}
			}

			// Configurar sincronización con callbacks específicos por rol
			const syncConfig = startRealtimeSync({
				syncTypes: ['tickets', 'comentarios', 'asignaciones'],
				onSyncTriggered: (data) => {
					console.log('✅ Sincronización activada desde Footer:', data);
					// Emitir evento personalizado para que las vistas puedan reaccionar
					window.dispatchEvent(new CustomEvent('manualSyncTriggered', {
						detail: {
							type: data.type,
							source: data.source,
							role: userData.role,
							timestamp: new Date().toISOString()
						}
					}));
				},
				onSyncRequested: (data) => {
					console.log('📡 Solicitud de sincronización enviada:', data);
				}
			});

			// Inicializar la sincronización primero
			if (syncConfig && syncConfig.initializeSync) {
				syncConfig.initializeSync();
			}

			// Ejecutar la sincronización manual
			if (syncConfig && syncConfig.triggerSync) {
				syncConfig.triggerSync('manual');
			}

			// Unirse a todas las rooms críticas si hay WebSocket conectado
			if (store.websocket.connected && store.websocket.socket) {
				joinAllCriticalRooms(store.websocket.socket, userData);
			}

			console.log('✅ Sincronización manual completada desde Footer');
		} catch (error) {
			console.error('❌ Error en sincronización manual desde Footer:', error);
		} finally {
			setIsSyncing(false);
		}
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
								className={`btn btn-sm me-2 ${isSyncing ? 'btn-warning' : 'btn-outline-primary'}`}
								onClick={handleManualSync}
								disabled={isSyncing || !store.auth.isAuthenticated || !store.auth.token}
								title={
									isSyncing
										? "Sincronizando..."
										: (!store.auth.isAuthenticated || !store.auth.token)
											? "Usuario no autenticado"
											: "Sincronizar ahora"
								}
							>
								{isSyncing ? (
									<>
										<span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
										⏳
									</>
								) : (
									'🔄'
								)}
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
