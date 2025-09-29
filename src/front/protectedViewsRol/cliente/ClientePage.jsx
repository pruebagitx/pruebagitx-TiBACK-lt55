import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useGlobalReducer from '../../hooks/useGlobalReducer';
import GoogleMapsLocation from '../../components/GoogleMapsLocation';
import ImageUpload from '../../components/ImageUpload';
import { VerTicketHD } from './VerTicketHD';

// Utilidades de token seguras
const tokenUtils = {
    decodeToken: (token) => {
        try {
            if (!token) return null;
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            return JSON.parse(atob(parts[1]));
        } catch (error) {
            return null;
        }
    },
    getUserId: (token) => {
        const payload = tokenUtils.decodeToken(token);
        return payload ? payload.user_id : null;
    },
    getRole: (token) => {
        const payload = tokenUtils.decodeToken(token);
        return payload ? payload.role : null;
    }
};

export function ClientePage() {
    const navigate = useNavigate();
    const { store, logout, dispatch, connectWebSocket, disconnectWebSocket, joinRoom, joinTicketRoom, startRealtimeSync, emitCriticalTicketAction, joinCriticalRooms, joinAllCriticalRooms } = useGlobalReducer();
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showInfoForm, setShowInfoForm] = useState(false);
    const [updatingInfo, setUpdatingInfo] = useState(false);
    const [showTicketForm, setShowTicketForm] = useState(false);
    const [userData, setUserData] = useState(null);
    const [solicitudesReapertura, setSolicitudesReapertura] = useState(new Set());
    const [infoData, setInfoData] = useState({
        nombre: '',
        apellido: '',
        email: '',
        telefono: '',
        direccion: '',
        lat: null,
        lng: null,
        password: '',
        confirmPassword: ''
    });
    const [ticketImageUrl, setTicketImageUrl] = useState('');
    const [ticketsConRecomendaciones, setTicketsConRecomendaciones] = useState(new Set());
    const [clienteImageUrl, setClienteImageUrl] = useState('');

    // Funciones para manejar la imagen del ticket
    const handleImageUpload = (imageUrl) => {
        setTicketImageUrl(imageUrl);
    };

    const handleImageRemove = () => {
        setTicketImageUrl('');
    };

    // Funciones para manejar la imagen del cliente
    const handleClienteImageUpload = (imageUrl) => {
        setClienteImageUrl(imageUrl);
        // Actualizar inmediatamente userData para mostrar la imagen
        setUserData(prev => ({
            ...prev,
            url_imagen: imageUrl
        }));
    };

    const handleClienteImageRemove = () => {
        setClienteImageUrl('');
        // Actualizar userData para remover la imagen
        setUserData(prev => ({
            ...prev,
            url_imagen: null
        }));
    };

    const toggleTicketForm = () => {
        setShowTicketForm(!showTicketForm);
        if (showTicketForm) {
            // Limpiar el formulario cuando se cierre
            setTicketImageUrl('');
        }
    };

    // FunciÃ³n helper para actualizar tickets sin recargar la pÃ¡gina
    const actualizarTickets = async () => {
        try {
            const token = store.auth.token;
            const ticketsResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/tickets/cliente`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (ticketsResponse.ok) {
                const ticketsData = await ticketsResponse.json();
                setTickets(ticketsData);

                // Limpiar solicitudes de reapertura para tickets que ya no estÃ¡n en estado 'solucionado'
                setSolicitudesReapertura(prev => {
                    const newSet = new Set();
                    ticketsData.forEach(ticket => {
                        if (ticket.estado.toLowerCase() === 'solucionado' && prev.has(ticket.id)) {
                            newSet.add(ticket.id);
                        }
                    });
                    return newSet;
                });
            }
        } catch (err) {
            console.error('Error al actualizar tickets:', err);
        }
    };

    // Conectar WebSocket cuando el usuario estÃ© autenticado
    useEffect(() => {
        if (store.auth.isAuthenticated && store.auth.token && !store.websocket.connected) {
            const socket = connectWebSocket(store.auth.token);
            if (socket) {
                const userId = tokenUtils.getUserId(store.auth.token);
                const role = tokenUtils.getRole(store.auth.token);
                joinRoom(socket, role, userId);
            }
        }

        // Cleanup al desmontar
        return () => {
            if (store.websocket.socket) {
                disconnectWebSocket(store.websocket.socket);
            }
        };
    }, [store.auth.isAuthenticated, store.auth.token]);

    // Unirse automÃ¡ticamente a los rooms de tickets del cliente
    useEffect(() => {
        if (store.websocket.socket && tickets.length > 0) {
            // Solo unirse a rooms de tickets que no estÃ©n ya unidos
            const joinedRooms = new Set();
            tickets.forEach(ticket => {
                if (!joinedRooms.has(ticket.id)) {
                    joinTicketRoom(store.websocket.socket, ticket.id);
                    joinedRooms.add(ticket.id);
                }
            });
        }
    }, [store.websocket.socket, tickets.length]); // Solo cuando cambia la cantidad de tickets

    // Configurar sincronizaciÃ³n crÃ­tica en tiempo real
    useEffect(() => {
        if (store.auth.user && store.websocket.connected && store.websocket.socket) {
            // Unirse a todas las rooms crÃ­ticas inmediatamente
            joinAllCriticalRooms(store.websocket.socket, store.auth.user);

            // Configurar sincronizaciÃ³n crÃ­tica
            const syncConfig = startRealtimeSync({
                syncTypes: ['tickets', 'comentarios'],
                onSyncTriggered: (data) => {
                    console.log('ðŸš¨ SincronizaciÃ³n crÃ­tica activada en ClientePage:', data);
                    if (data.type === 'tickets' || data.priority === 'critical') {
                        actualizarTickets();
                    }
                }
            });

            // Unirse a rooms crÃ­ticos de todos los tickets del cliente
            const ticketIds = tickets.map(ticket => ticket.id);
            if (ticketIds.length > 0) {
                joinCriticalRooms(store.websocket.socket, ticketIds, store.auth.user);
            }
        }
    }, [store.auth.user, store.websocket.connected, tickets.length]);

    // Efecto para manejar sincronizaciÃ³n manual desde Footer
    useEffect(() => {
        const handleManualSync = (event) => {
            console.log('ðŸ”„ SincronizaciÃ³n manual recibida en ClientePage:', event.detail);
            if (event.detail.role === 'cliente') {
                actualizarTickets();
            }
        };

        window.addEventListener('manualSyncTriggered', handleManualSync);
        return () => window.removeEventListener('manualSyncTriggered', handleManualSync);
    }, []);

    // Efecto para manejar actualizaciones crÃ­ticas de tickets
    useEffect(() => {
        if (store.websocket.criticalTicketUpdate) {
            const criticalUpdate = store.websocket.criticalTicketUpdate;
            console.log('ðŸš¨ ACTUALIZACIÃ“N CRÃTICA RECIBIDA EN CLIENTE:', criticalUpdate);

            // Actualizar inmediatamente para acciones crÃ­ticas
            if (criticalUpdate.priority === 'critical') {
                actualizarTickets();

                // Mostrar notificaciÃ³n visual si es necesario
                if (criticalUpdate.action === 'comentario_agregado' ||
                    criticalUpdate.action === 'ticket_actualizado' ||
                    criticalUpdate.action.includes('estado_cambiado') ||
                    criticalUpdate.action.includes('ticket_asignado')) {
                    console.log(`ðŸš¨ AcciÃ³n crÃ­tica: ${criticalUpdate.action} en ticket ${criticalUpdate.ticket_id}`);
                }
            }
        }
    }, [store.websocket.criticalTicketUpdate]);

    // Actualizar tickets cuando lleguen notificaciones WebSocket
    useEffect(() => {
        if (store.websocket.notifications.length > 0) {
            const lastNotification = store.websocket.notifications[store.websocket.notifications.length - 1];

            // Manejo especÃ­fico para tickets eliminados - sincronizaciÃ³n inmediata
            if (lastNotification.tipo === 'eliminado' || lastNotification.tipo === 'ticket_eliminado') {

                // Remover inmediatamente de la lista de tickets
                if (lastNotification.ticket_id) {
                    setTickets(prev => {
                        const ticketRemovido = prev.find(t => t.id === lastNotification.ticket_id);
                        if (ticketRemovido) {
                        }
                        return prev.filter(ticket => ticket.id !== lastNotification.ticket_id);
                    });

                    // TambiÃ©n remover de las solicitudes de reapertura si existe
                    setSolicitudesReapertura(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(lastNotification.ticket_id);
                        return newSet;
                    });
                }
                return; // No continuar con el resto de la lÃ³gica
            }

            // ActualizaciÃ³n ULTRA RÃPIDA para todos los eventos crÃ­ticos
            if (lastNotification.tipo === 'asignado' || lastNotification.tipo === 'estado_cambiado' || lastNotification.tipo === 'iniciado' || lastNotification.tipo === 'escalado' || lastNotification.tipo === 'creado') {
                // Los datos ya estÃ¡n en el store por el WebSocket - actualizaciÃ³n instantÃ¡nea
            }

            // SincronizaciÃ³n ULTRA RÃPIDA con servidor para TODOS los eventos
            actualizarTickets();
        }
    }, [store.websocket.notifications]);

    // Cargar datos del usuario y tickets
    useEffect(() => {
        const cargarDatos = async () => {
            try {
                setLoading(true);
                const token = store.auth.token;
                const userId = tokenUtils.getUserId(token);

                // Cargar datos del usuario
                const userResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/clientes/${userId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    setUserData(userData);
                    setInfoData({
                        nombre: userData.nombre === 'Pendiente' ? '' : userData.nombre || '',
                        apellido: userData.apellido === 'Pendiente' ? '' : userData.apellido || '',
                        email: userData.email || '',
                        telefono: userData.telefono === '0000000000' ? '' : userData.telefono || '',
                        direccion: userData.direccion === 'Pendiente' ? '' : userData.direccion || '',
                        lat: userData.latitude || null,
                        lng: userData.longitude || null,
                        password: '',
                        confirmPassword: ''
                    });
                    setClienteImageUrl(userData.url_imagen || '');
                }

                // Cargar tickets del cliente
                const ticketsResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/tickets/cliente`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!ticketsResponse.ok) {
                    throw new Error('Error al cargar tickets');
                }

                const ticketsData = await ticketsResponse.json();
                setTickets(ticketsData);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        cargarDatos();
    }, [store.auth.token]);

    // Verificar recomendaciones para todos los tickets
    useEffect(() => {
        if (tickets.length > 0 && store.auth.token && store.auth.isAuthenticated) {
            // Agregar un pequeÃ±o delay para evitar llamadas mÃºltiples
            const timeoutId = setTimeout(() => {
                verificarRecomendaciones();
            }, 500);

            return () => clearTimeout(timeoutId);
        }
    }, [tickets.length, store.auth.token, store.auth.isAuthenticated]);

    const verificarRecomendaciones = async () => {
        try {
            const token = store.auth.token;

            // Validaciones robustas
            if (!tickets || tickets.length === 0) {
                console.log('âš ï¸ No hay tickets para verificar recomendaciones');
                return;
            }

            if (!token) {
                console.log('âš ï¸ No hay token para verificar recomendaciones');
                return;
            }

            console.log(`ðŸ” Verificando recomendaciones para ${tickets.length} tickets...`);

            const recomendacionesPromises = tickets.map(async (ticket) => {
                try {
                    // Validar que el ticket tenga contenido vÃ¡lido
                    if (!ticket.titulo || !ticket.descripcion || ticket.titulo.trim() === '' || ticket.descripcion.trim() === '') {
                        console.log(`âš ï¸ Ticket ${ticket.id} sin contenido suficiente para recomendaciones`);
                        return { ticketId: ticket.id, tieneRecomendaciones: false, razon: 'sin_contenido' };
                    }

                    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/tickets/${ticket.id}/recomendaciones-similares`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        // Aumentar timeout para requests mÃ¡s robustos
                        signal: AbortSignal.timeout(15000) // 15 segundos timeout
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const tieneRecomendaciones = data.total_encontrados > 0;
                        console.log(`âœ… Ticket ${ticket.id}: ${data.total_encontrados} recomendaciones encontradas`);
                        return {
                            ticketId: ticket.id,
                            tieneRecomendaciones,
                            totalRecomendaciones: data.total_encontrados,
                            algoritmo: data.algoritmo || 'legacy'
                        };
                    } else {
                        // Log del error especÃ­fico pero no fallar
                        console.warn(`âš ï¸ Error ${response.status} verificando recomendaciones para ticket ${ticket.id}`);
                        return { ticketId: ticket.id, tieneRecomendaciones: false, razon: `error_${response.status}` };
                    }
                } catch (fetchError) {
                    // Manejar errores individuales sin fallar toda la operaciÃ³n
                    if (fetchError.name === 'AbortError') {
                        console.warn(`â° Timeout verificando recomendaciones para ticket ${ticket.id}`);
                        return { ticketId: ticket.id, tieneRecomendaciones: false, razon: 'timeout' };
                    } else if (fetchError.name === 'TypeError' && fetchError.message.includes('Failed to fetch')) {
                        console.warn(`ðŸŒ Error de red verificando recomendaciones para ticket ${ticket.id}`);
                        return { ticketId: ticket.id, tieneRecomendaciones: false, razon: 'network_error' };
                    } else {
                        console.warn(`âŒ Error verificando recomendaciones para ticket ${ticket.id}:`, fetchError.message);
                        return { ticketId: ticket.id, tieneRecomendaciones: false, razon: 'unknown_error' };
                    }
                }
            });

            const resultados = await Promise.all(recomendacionesPromises);

            // AnÃ¡lisis detallado de resultados
            const ticketsConRecomendaciones = resultados.filter(r => r.tieneRecomendaciones);
            const ticketsSinRecomendaciones = resultados.filter(r => !r.tieneRecomendaciones);

            console.log('ðŸ“Š Resultados de recomendaciones:', {
                total: resultados.length,
                conRecomendaciones: ticketsConRecomendaciones.length,
                sinRecomendaciones: ticketsSinRecomendaciones.length,
                detalles: resultados
            });

            // Log especÃ­fico para tickets sin recomendaciones
            if (ticketsSinRecomendaciones.length > 0) {
                console.log('âš ï¸ Tickets sin recomendaciones:', ticketsSinRecomendaciones.map(t => ({
                    id: t.ticketId,
                    razon: t.razon
                })));
            }

            // Actualizar estado con validaciones robustas
            const ticketsConRecomendacionesSet = new Set();
            resultados.forEach(({ ticketId, tieneRecomendaciones }) => {
                if (tieneRecomendaciones) {
                    ticketsConRecomendacionesSet.add(ticketId);
                }
            });
            setTicketsConRecomendaciones(ticketsConRecomendacionesSet);

            console.log(`âœ… VerificaciÃ³n de recomendaciones completada para ${tickets.length} tickets`);
        } catch (error) {
            console.error('âŒ Error general verificando recomendaciones:', error);
            // En caso de error general, limpiar el estado
            setTicketsConRecomendaciones(new Set());
        }
    };

    const crearTicket = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const ticketData = {
            titulo: formData.get('titulo'),
            descripcion: formData.get('descripcion'),
            prioridad: formData.get('prioridad'),
            url_imagen: ticketImageUrl
        };

        try {
            const token = store.auth.token;

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/tickets`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(ticketData)
            });

            if (!response.ok) {
                throw new Error('Error al crear ticket');
            }

            // Limpiar el formulario despuÃ©s de crear el ticket exitosamente
            e.target.reset();
            setTicketImageUrl(''); // Limpiar la imagen tambiÃ©n
            setShowTicketForm(false); // Cerrar el formulario

            // Obtener el ID del ticket creado para emitir acciÃ³n crÃ­tica
            const responseData = await response.json();
            const ticketId = responseData.id;

            // Emitir acciÃ³n crÃ­tica de ticket creado
            if (store.websocket.socket && ticketId) {
                emitCriticalTicketAction(store.websocket.socket, ticketId, 'ticket_creado', store.auth.user);
            }

            // Actualizar tickets sin recargar la pÃ¡gina
            await actualizarTickets();

            // Unirse al room del nuevo ticket
            if (store.websocket.socket && ticketId) {
                joinTicketRoom(store.websocket.socket, ticketId);
                // TambiÃ©n unirse a rooms crÃ­ticos
                joinCriticalRooms(store.websocket.socket, [ticketId], store.auth.user);
            }
        } catch (err) {
            setError(err.message);
        }
    };

    const getEstadoColor = (estado) => {
        switch (estado.toLowerCase()) {
            case 'creado': return 'badge bg-secondary';
            case 'en_espera': return 'badge bg-warning';
            case 'en_proceso': return 'badge bg-primary';
            case 'solucionado': return 'badge bg-success';
            case 'cerrado': return 'badge bg-dark';
            case 'reabierto': return 'badge bg-danger';
            default: return 'badge bg-secondary';
        }
    };

    const getPrioridadColor = (prioridad) => {
        switch (prioridad.toLowerCase()) {
            case 'alta': return 'badge bg-danger';
            case 'media': return 'badge bg-warning';
            case 'baja': return 'badge bg-success';
            default: return 'badge bg-secondary';
        }
    };

    const evaluarTicket = async (ticketId, calificacion) => {
        try {
            const token = store.auth.token;
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/tickets/${ticketId}/evaluar`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ calificacion })
            });

            if (!response.ok) {
                throw new Error('Error al evaluar ticket');
            }

            // Actualizar tickets sin recargar la pÃ¡gina
            await actualizarTickets();
        } catch (err) {
            setError(err.message);
        }
    };

    const solicitarReapertura = async (ticketId) => {
        try {
            const token = store.auth.token;
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/tickets/${ticketId}/estado`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ estado: 'solicitar_reapertura' })
            });

            if (!response.ok) {
                throw new Error('Error al solicitar reapertura');
            }

            // Agregar el ticket a las solicitudes de reapertura pendientes
            setSolicitudesReapertura(prev => new Set([...prev, ticketId]));

            // Actualizar tickets sin recargar la pÃ¡gina
            await actualizarTickets();
        } catch (err) {
            setError(err.message);
        }
    };

    const reabrirTicket = async (ticketId) => {
        try {
            const token = store.auth.token;
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/tickets/${ticketId}/estado`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ estado: 'reabierto' })
            });

            if (!response.ok) {
                throw new Error('Error al reabrir ticket');
            }

            // Actualizar tickets sin recargar la pÃ¡gina
            await actualizarTickets();
        } catch (err) {
            setError(err.message);
        }
    };

    // FunciÃ³n para actualizar informaciÃ³n del cliente
    const updateInfo = async () => {
        try {
            setUpdatingInfo(true);
            const token = store.auth.token;
            const userId = tokenUtils.getUserId(token);

            // Validar contraseÃ±as si se estÃ¡n cambiando
            if (infoData.password && infoData.password !== infoData.confirmPassword) {
                setError('Las contraseÃ±as no coinciden');
                return;
            }

            const updateData = {
                nombre: infoData.nombre,
                apellido: infoData.apellido,
                email: infoData.email,
                telefono: infoData.telefono,
                direccion: infoData.direccion,
                latitude: infoData.lat,
                longitude: infoData.lng,
                url_imagen: clienteImageUrl || userData?.url_imagen
            };

            // Solo incluir contraseÃ±a si se estÃ¡ cambiando
            if (infoData.password) {
                updateData.password = infoData.password;
            }

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/clientes/${userId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                throw new Error('Error al actualizar informaciÃ³n');
            }

            const updatedUser = await response.json();
            setUserData(updatedUser);
            setShowInfoForm(false);
            setClienteImageUrl(''); // Limpiar imagen temporal
            setError('');

            // Limpiar contraseÃ±as del formulario
            setInfoData(prev => ({
                ...prev,
                password: '',
                confirmPassword: ''
            }));

        } catch (err) {
            setError(err.message);
        } finally {
            setUpdatingInfo(false);
        }
    };

    // FunciÃ³n para manejar cambios en el formulario de informaciÃ³n
    const handleInfoChange = (e) => {
        const { name, value } = e.target;
        setInfoData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const cerrarTicket = async (ticketId) => {
        try {
            // Solicitar calificaciÃ³n antes de cerrar
            const calificacion = prompt('Califica el servicio (1-5):');
            if (!calificacion || calificacion < 1 || calificacion > 5) {
                alert('Debes proporcionar una calificaciÃ³n vÃ¡lida entre 1 y 5');
                return;
            }

            const token = store.auth.token;
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/tickets/${ticketId}/estado`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    estado: 'cerrado',
                    calificacion: parseInt(calificacion)
                })
            });

            if (!response.ok) {
                throw new Error('Error al cerrar ticket');
            }

            // Actualizar tickets sin recargar la pÃ¡gina
            await actualizarTickets();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleLocationChange = (location) => {
        setInfoData(prev => ({
            ...prev,
            direccion: location.address,
            lat: location.lat,
            lng: location.lng
        }));
    };

    const generarRecomendacion = (ticket) => {
        // Redirigir a la vista de recomendaciÃ³n IA
        navigate(`/ticket/${ticket.id}/recomendacion-ia`);
    };

    // FunciÃ³n para verificar si un ticket tiene analista asignado
    const tieneAnalistaAsignado = (ticket) => {
        return ticket.asignacion_actual && ticket.asignacion_actual.analista;
    };

    // FunciÃ³n para obtener el nombre del analista asignado
    const getAnalistaAsignado = (ticket) => {
        if (tieneAnalistaAsignado(ticket)) {
            const analista = ticket.asignacion_actual.analista;
            return `${analista.nombre} ${analista.apellido}`;
        }
        return null;
    };

    // FunciÃ³n para obtener la fecha de asignaciÃ³n
    const getFechaAsignacion = (ticket) => {
        if (tieneAnalistaAsignado(ticket)) {
            const fecha = ticket.asignacion_actual.fecha_asignacion;
            return new Date(fecha).toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        return null;
    };


    // Estados para el diseÃ±o Hyper
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarHidden, setSidebarHidden] = useState(false);
    const [activeView, setActiveView] = useState('dashboard');
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const [selectedTicketId, setSelectedTicketId] = useState(null);

    // FunciÃ³n para alternar sidebar
    const toggleSidebar = () => {
        console.log('Toggle sidebar - Estado actual:', sidebarHidden);
        setSidebarHidden(!sidebarHidden);
        console.log('Toggle sidebar - Nuevo estado:', !sidebarHidden);
    };

    // FunciÃ³n para cambiar vista
    const changeView = (view) => {
        console.log('changeView called with:', view);
        setActiveView(view);
        if (view.startsWith('ticket-')) {
            const ticketId = view.replace('ticket-', '');
            console.log('Setting selectedTicketId to:', parseInt(ticketId));
            setSelectedTicketId(parseInt(ticketId));
        } else {
            setSelectedTicketId(null);
        }
    };

    // Cerrar dropdown al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showUserDropdown && !event.target.closest('.dropdown')) {
                setShowUserDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showUserDropdown]);

    return (
        <div className="hyper-layout d-flex">
            {/* Sidebar izquierdo */}
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

            {/* Contenido principal */}
            <div className={`hyper-main-content flex-grow-1 ${sidebarHidden ? 'sidebar-hidden' : ''}`}>
                {/* Header superior */}
                <header className="hyper-header bg-white border-bottom p-3">
                    <div className="d-flex align-items-center justify-content-between w-100">
                        <div className="d-flex align-items-center gap-3">
                            <button
                                className="hyper-sidebar-toggle btn btn-link p-2"
                                onClick={toggleSidebar}
                                title={sidebarHidden ? "Mostrar menú" : "Ocultar menú"}
                            >
                                <i className={`fas ${sidebarHidden ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                            </button>

                            <div className="hyper-search position-relative">
                                <i className="fas fa-search position-absolute top-50 start-0 translate-middle-y ms-3 text-muted"></i>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Buscar tickets, analistas..."
                                />
                            </div>
                        </div>

                        <div className="d-flex align-items-center gap-3">
                            <div className="d-flex align-items-center gap-2">
                                <button className="hyper-header-btn btn btn-link p-2">
                                    <i className="fas fa-th"></i>
                                </button>
                                <button className="hyper-header-btn btn btn-link p-2 position-relative">
                                    <i className="fas fa-bell"></i>
                                    <span className="hyper-notification-badge badge bg-danger rounded-pill">3</span>
                                </button>
                                <button className="hyper-header-btn btn btn-link p-2">
                                    <i className="fas fa-sun"></i>
                                </button>
                                <button className="hyper-header-btn btn btn-link p-2">
                                    <i className="fas fa-expand-arrows-alt"></i>
                                </button>
                            </div>

                            <div className="dropdown">
                                <div
                                    className="hyper-user-profile d-flex align-items-center gap-3 p-2 rounded"
                                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {userData?.url_imagen ? (
                                        <img
                                            src={userData.url_imagen}
                                            alt="Avatar"
                                            className="hyper-user-avatar rounded-circle"
                                        />
                                    ) : (
                                        <div className="hyper-user-avatar bg-light d-flex align-items-center justify-content-center rounded-circle">
                                            <i className="fas fa-user text-muted"></i>
                                        </div>
                                    )}
                                    <div className="hyper-user-info">
                                        <p className="hyper-user-name mb-0 fw-semibold">
                                            {userData?.nombre === 'Pendiente' ? 'Cliente' : userData?.nombre} {userData?.apellido === 'Pendiente' ? '' : userData?.apellido}
                                        </p>
                                        <p className="hyper-user-role mb-0 small text-muted">Cliente</p>
                                    </div>
                                    <button className="hyper-header-btn btn btn-link p-1">
                                        <i className={`fas fa-chevron-down ${showUserDropdown ? 'rotate-180' : ''}`}></i>
                                    </button>
                                </div>

                                {showUserDropdown && (
                                    <div className="dropdown-menu show position-absolute" style={{ right: 0, top: '100%', minWidth: '200px' }}>
                                        <div className="dropdown-header">
                                            <h6 className="mb-0">Mi Cuenta</h6>
                                        </div>
                                        <button
                                            className="dropdown-item d-flex align-items-center gap-2"
                                            onClick={() => {
                                                changeView('profile');
                                                setShowUserDropdown(false);
                                            }}
                                        >
                                            <i className="fas fa-user"></i>
                                            Mi Perfil
                                        </button>
                                        <button className="dropdown-item d-flex align-items-center gap-2">
                                            <i className="fas fa-cog"></i>
                                            Configuración
                                        </button>
                                        <div className="dropdown-divider"></div>
                                        <button
                                            className="dropdown-item d-flex align-items-center gap-2 text-danger"
                                            onClick={logout}
                                        >
                                            <i className="fas fa-sign-out-alt"></i>
                                            Cerrar Sesión
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Contenido del dashboard */}
                <div className="p-4">
                    {error && (
                        <div className="alert alert-danger" role="alert">
                            {error}
                        </div>
                    )}

                    {/* Dashboard View */}
                    {activeView === 'dashboard' && (
                        <>
                            <h1 className="mb-4 fw-semibold">Dashboard</h1>

                            {/* Tarjetas de métricas */}
                            <div className="row g-4 mb-5">
                                <div className="col-md-4">
                                    <div className="card border-0 shadow-sm">
                                        <div className="card-body text-center">
                                            <div className="mb-3">
                                                <i className="fas fa-ticket-alt fa-2x text-primary"></i>
                                            </div>
                                            <h3 className="mb-1">{tickets.length}</h3>
                                            <p className="text-muted mb-0">Total Tickets</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="col-md-4">
                                    <div className="card border-0 shadow-sm">
                                        <div className="card-body text-center">
                                            <div className="mb-3">
                                                <i className="fas fa-clock fa-2x text-warning"></i>
                                            </div>
                                            <h3 className="mb-1">
                                                {tickets.filter(t => ['creado', 'en_espera', 'en_proceso'].includes(t.estado.toLowerCase())).length}
                                            </h3>
                                            <p className="text-muted mb-0">En Proceso</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="col-md-4">
                                    <div className="card border-0 shadow-sm">
                                        <div className="card-body text-center">
                                            <div className="mb-3">
                                                <i className="fas fa-check-circle fa-2x text-success"></i>
                                            </div>
                                            <h3 className="mb-1">
                                                {tickets.filter(t => ['solucionado', 'cerrado'].includes(t.estado.toLowerCase())).length}
                                            </h3>
                                            <p className="text-muted mb-0">Resueltos</p>
                                        </div>
                                    </div>
                                </div>

                            </div>

                            {/* Estadísticas adicionales */}
                            <div className="row g-4 mb-5">
                                <div className="col-md-6">
                                    <div className="card border-0 shadow-sm">
                                        <div className="card-body">
                                            <div className="d-flex align-items-center mb-3">
                                                <div className="me-3">
                                                    <i className="fas fa-chart-line fa-2x text-info"></i>
                                                </div>
                                                <div>
                                                    <h6 className="mb-1">Tiempo Promedio</h6>
                                                    <h4 className="mb-0 text-info">
                                                        {tickets.filter(t => t.fecha_solucion).length > 0
                                                            ? Math.round(tickets.filter(t => t.fecha_solucion).reduce((acc, t) => {
                                                                const created = new Date(t.fecha_creacion);
                                                                const solved = new Date(t.fecha_solucion);
                                                                return acc + (solved - created) / (1000 * 60 * 60 * 24);
                                                            }, 0) / tickets.filter(t => t.fecha_solucion).length)
                                                            : 0
                                                        } días
                                                    </h4>
                                                </div>
                                            </div>
                                            <p className="text-muted mb-0 small">Tiempo promedio de resolución</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-md-6">
                                    <div className="card border-0 shadow-sm">
                                        <div className="card-body">
                                            <div className="d-flex align-items-center mb-3">
                                                <div className="me-3">
                                                    <i className="fas fa-star fa-2x text-warning"></i>
                                                </div>
                                                <div>
                                                    <h6 className="mb-1">Calificación</h6>
                                                    <h4 className="mb-0 text-warning">
                                                        {tickets.filter(t => t.calificacion).length > 0
                                                            ? (tickets.filter(t => t.calificacion).reduce((acc, t) => acc + t.calificacion, 0) / tickets.filter(t => t.calificacion).length).toFixed(1)
                                                            : '0.0'
                                                        }/5
                                                    </h4>
                                                </div>
                                            </div>
                                            <p className="text-muted mb-0 small">Calificación promedio recibida</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Distribución por estado */}
                            <div className="row g-4 mb-5">
                                <div className="col-12">
                                    <div className="card border-0 shadow-sm">
                                        <div className="card-header bg-white border-0">
                                            <h5 className="card-title mb-0">Distribución por Estado</h5>
                                        </div>
                                        <div className="card-body">
                                            <div className="row g-3">
                                                <div className="col-md-3">
                                                    <div className="text-center p-3 border rounded">
                                                        <div className="mb-2">
                                                            <i className="fas fa-plus-circle fa-2x text-primary"></i>
                                                        </div>
                                                        <h4 className="text-primary mb-1">
                                                            {tickets.filter(t => t.estado.toLowerCase() === 'creado').length}
                                                        </h4>
                                                        <p className="text-muted mb-0 small">Creados</p>
                                                    </div>
                                                </div>
                                                <div className="col-md-3">
                                                    <div className="text-center p-3 border rounded">
                                                        <div className="mb-2">
                                                            <i className="fas fa-pause-circle fa-2x text-warning"></i>
                                                        </div>
                                                        <h4 className="text-warning mb-1">
                                                            {tickets.filter(t => t.estado.toLowerCase() === 'en_espera').length}
                                                        </h4>
                                                        <p className="text-muted mb-0 small">En Espera</p>
                                                    </div>
                                                </div>
                                                <div className="col-md-3">
                                                    <div className="text-center p-3 border rounded">
                                                        <div className="mb-2">
                                                            <i className="fas fa-cog fa-2x text-info"></i>
                                                        </div>
                                                        <h4 className="text-info mb-1">
                                                            {tickets.filter(t => t.estado.toLowerCase() === 'en_proceso').length}
                                                        </h4>
                                                        <p className="text-muted mb-0 small">En Proceso</p>
                                                    </div>
                                                </div>
                                                <div className="col-md-3">
                                                    <div className="text-center p-3 border rounded">
                                                        <div className="mb-2">
                                                            <i className="fas fa-check-circle fa-2x text-success"></i>
                                                        </div>
                                                        <h4 className="text-success mb-1">
                                                            {tickets.filter(t => ['solucionado', 'cerrado'].includes(t.estado.toLowerCase())).length}
                                                        </h4>
                                                        <p className="text-muted mb-0 small">Completados</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tickets recientes */}
                            <div className="row g-4">
                                <div className="col-12">
                                    <div className="card border-0 shadow-sm">
                                        <div className="card-header bg-white border-0">
                                            <h5 className="card-title mb-0">Tickets Recientes</h5>
                                        </div>
                                        <div className="card-body">
                                            {tickets.length > 0 ? (
                                                <div className="table-responsive">
                                                    <table className="table table-hover">
                                                        <thead>
                                                            <tr>
                                                                <th>ID</th>
                                                                <th>Título</th>
                                                                <th>Estado</th>
                                                                <th>Fecha y Hora</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {tickets.slice(0, 5).map((ticket) => (
                                                                <tr key={ticket.id}>
                                                                    <td>#{ticket.id}</td>
                                                                    <td>{ticket.titulo}</td>
                                                                    <td>
                                                                        <span className={`badge ${ticket.estado.toLowerCase() === 'solucionado' ? 'bg-success' :
                                                                            ticket.estado.toLowerCase() === 'en_proceso' ? 'bg-warning' :
                                                                                'bg-primary'
                                                                            }`}>
                                                                            {ticket.estado}
                                                                        </span>
                                                                    </td>
                                                                    <td>
                                                                        {new Date(ticket.fecha_creacion).toLocaleDateString('es-ES', {
                                                                            year: 'numeric',
                                                                            month: 'short',
                                                                            day: 'numeric',
                                                                            hour: '2-digit',
                                                                            minute: '2-digit',
                                                                            hour12: true
                                                                        })}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div className="text-center py-4">
                                                    <i className="fas fa-ticket-alt fa-3x text-muted mb-3"></i>
                                                    <p className="text-muted">No tienes tickets aún</p>
                                                    <button
                                                        className="btn btn-primary"
                                                        onClick={() => changeView('create')}
                                                    >
                                                        Crear mi primer ticket
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Todos los tickets */}
                            <div className="row g-4">
                                <div className="col-12">
                                    <div className="card border-0 shadow-sm">
                                        <div className="card-header bg-white border-0 d-flex justify-content-between align-items-center">
                                            <h5 className="card-title mb-0">Todos los Tickets</h5>
                                            <div className="d-flex gap-2">
                                                <button
                                                    className="btn btn-outline-primary btn-sm"
                                                    onClick={() => changeView('tickets')}
                                                >
                                                    Ver Todos
                                                </button>
                                            </div>
                                        </div>
                                        <div className="card-body">
                                            {tickets.length > 0 ? (
                                                <div className="table-responsive">
                                                    <table className="table table-hover">
                                                        <thead>
                                                            <tr>
                                                                <th>ID</th>
                                                                <th>Título</th>
                                                                <th>Descripción</th>
                                                                <th>Estado</th>
                                                                <th>Prioridad</th>
                                                                <th>Fecha</th>
                                                                <th>Acciones</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {tickets.map((ticket) => (
                                                                <tr key={ticket.id}>
                                                                    <td>
                                                                        <span className="fw-bold text-primary">#{ticket.id}</span>
                                                                    </td>
                                                                    <td>
                                                                        <div className="d-flex flex-column">
                                                                            <span className="fw-semibold">{ticket.titulo}</span>
                                                                            {ticket.categoria && (
                                                                                <small className="text-muted">{ticket.categoria}</small>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td>
                                                                        <div className="text-truncate" style={{ maxWidth: '200px' }} title={ticket.descripcion}>
                                                                            {ticket.descripcion}
                                                                        </div>
                                                                    </td>
                                                                    <td>
                                                                        <span className={`badge ${ticket.estado.toLowerCase() === 'solucionado' ? 'bg-success' :
                                                                            ticket.estado.toLowerCase() === 'en_proceso' ? 'bg-warning' :
                                                                                ticket.estado.toLowerCase() === 'en_espera' ? 'bg-info' :
                                                                                    'bg-primary'
                                                                            }`}>
                                                                            {ticket.estado}
                                                                        </span>
                                                                    </td>
                                                                    <td>
                                                                        <span className={`badge ${ticket.prioridad === 'alta' ? 'bg-danger' :
                                                                            ticket.prioridad === 'media' ? 'bg-warning' :
                                                                                'bg-success'
                                                                            }`}>
                                                                            {ticket.prioridad || 'Normal'}
                                                                        </span>
                                                                    </td>
                                                                    <td>
                                                                        <div className="d-flex flex-column">
                                                                            <small className="text-muted">
                                                                                {new Date(ticket.fecha_creacion).toLocaleDateString('es-ES', {
                                                                                    year: 'numeric',
                                                                                    month: 'short',
                                                                                    day: 'numeric',
                                                                                    hour: '2-digit',
                                                                                    minute: '2-digit',
                                                                                    hour12: true
                                                                                })}
                                                                            </small>
                                                                            {ticket.fecha_solucion && (
                                                                                <small className="text-success">
                                                                                    Resuelto: {new Date(ticket.fecha_solucion).toLocaleDateString('es-ES')}
                                                                                </small>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td>
                                                                        <span className="text-muted">-</span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div className="text-center py-4">
                                                    <i className="fas fa-ticket-alt fa-3x text-muted mb-3"></i>
                                                    <p className="text-muted">No tienes tickets aún</p>
                                                    <button
                                                        className="btn btn-primary"
                                                        onClick={() => changeView('create')}
                                                    >
                                                        Crear mi primer ticket
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </>
                    )}

                    {/* Tickets View */}
                    {activeView === 'tickets' && (
                        <>
                            <h1 className="hyper-page-title">Mis Tickets</h1>

                            <div className="card border-0 shadow-sm">
                                <div className="card-header bg-white border-0 d-flex justify-content-between align-items-center">
                                    <h5 className="card-title mb-0">Mis Tickets</h5>
                                    <div className="d-flex gap-2">
                                        <button className="btn btn-outline-secondary btn-sm">
                                            <i className="fas fa-download me-1"></i>
                                            Exportar
                                        </button>
                                        <button className="btn btn-outline-primary btn-sm">
                                            <i className="fas fa-filter me-1"></i>
                                            Filtrar
                                        </button>
                                    </div>
                                </div>
                                <div className="card-body p-0">

                                    {loading ? (
                                        <div className="text-center py-4">
                                            <div className="spinner-border text-primary" role="status">
                                                <span className="visually-hidden">Cargando tickets...</span>
                                            </div>
                                        </div>
                                    ) : tickets.length === 0 ? (
                                        <div className="text-center py-4">
                                            <i className="fas fa-ticket-alt fa-3x text-muted mb-3"></i>
                                            <p className="text-muted">No tienes tickets creados aÃºn.</p>
                                            <button
                                                className="btn btn-primary"
                                                onClick={() => changeView('create')}
                                            >
                                                <i className="fas fa-plus me-1"></i>
                                                Crear mi primer ticket
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="table-responsive">
                                            <table className="table table-hover mb-0">
                                                <thead className="table-light">
                                                    <tr>
                                                        <th className="text-center px-3">ID</th>
                                                        <th className="px-4">Título</th>
                                                        <th className="text-center px-3">Estado</th>
                                                        <th className="text-center px-3">Prioridad</th>
                                                        <th className="text-center px-3">Asignado a</th>
                                                        <th className="text-center px-3">Fecha</th>
                                                        <th className="text-center px-3">Calificación</th>
                                                        <th className="text-center px-4">Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {tickets.map((ticket) => (
                                                        <tr key={ticket.id}>
                                                            <td className="text-center px-3">
                                                                <span className="fw-bold text-primary">#{ticket.id}</span>
                                                            </td>
                                                            <td className="px-4">
                                                                <div>
                                                                    <div className="fw-semibold mb-1">{ticket.titulo}</div>
                                                                    <small className="text-muted">
                                                                        {ticket.descripcion.length > 50
                                                                            ? `${ticket.descripcion.substring(0, 50)}...`
                                                                            : ticket.descripcion
                                                                        }
                                                                    </small>
                                                                </div>
                                                            </td>
                                                            <td className="text-center px-3">
                                                                <span className={`badge ${ticket.estado.toLowerCase() === 'solucionado' ? 'bg-success' :
                                                                    ticket.estado.toLowerCase() === 'en_proceso' ? 'bg-warning' :
                                                                        ticket.estado.toLowerCase() === 'en_espera' ? 'bg-info' :
                                                                            'bg-primary'
                                                                    }`}>
                                                                    {ticket.estado}
                                                                </span>
                                                            </td>
                                                            <td className="text-center px-3">
                                                                <span className={`badge ${ticket.prioridad === 'alta' ? 'bg-danger' :
                                                                    ticket.prioridad === 'media' ? 'bg-warning' :
                                                                        'bg-success'
                                                                    }`}>
                                                                    {ticket.prioridad || 'Normal'}
                                                                </span>
                                                            </td>
                                                            <td className="text-center px-3">
                                                                {tieneAnalistaAsignado(ticket) ? (
                                                                    <span className="badge bg-success">
                                                                        <i className="fas fa-user-tie me-1"></i>
                                                                        {getAnalistaAsignado(ticket)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-muted">
                                                                        <i className="fas fa-clock me-1"></i>
                                                                        Sin asignar
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="text-center px-3">
                                                                <small className="text-muted">
                                                                    {new Date(ticket.fecha_creacion).toLocaleDateString('es-ES', {
                                                                        year: 'numeric',
                                                                        month: 'short',
                                                                        day: 'numeric',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit',
                                                                        hour12: true
                                                                    })}
                                                                </small>
                                                            </td>
                                                            <td className="text-center px-3">
                                                                {ticket.calificacion ? (
                                                                    <div className="d-flex align-items-center justify-content-center">
                                                                        {[...Array(5)].map((_, i) => (
                                                                            <i
                                                                                key={i}
                                                                                className={`fas fa-star ${i < ticket.calificacion ? 'text-warning' : 'text-muted'}`}
                                                                                style={{ fontSize: '0.8rem' }}
                                                                            ></i>
                                                                        ))}
                                                                        <small className="ms-1 text-muted">({ticket.calificacion}/5)</small>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-muted">Sin calificar</span>
                                                                )}
                                                            </td>
                                                            <td className="text-center px-4">
                                                                <div className="d-flex flex-column gap-2">
                                                                    {/* Fila superior: Ver detalles, Comentarios, Chat */}
                                                                    <div className="d-flex gap-1">
                                                                        <button
                                                                            className="btn btn-outline-primary btn-sm"
                                                                            title="Ver detalles"
                                                                            onClick={() => {
                                                                                changeView(`ticket-${ticket.id}`);
                                                                            }}
                                                                        >
                                                                            <i className="fas fa-eye"></i>
                                                                        </button>
                                                                        <Link
                                                                            to={`/ticket/${ticket.id}/comentarios`}
                                                                            className="btn btn-info btn-sm"
                                                                            title="Ver y agregar comentarios"
                                                                        >
                                                                            <i className="fas fa-comments"></i>
                                                                        </Link>
                                                                        <Link
                                                                            to={`/ticket/${ticket.id}/chat-analista-cliente`}
                                                                            className={`btn btn-sm ${tieneAnalistaAsignado(ticket) ? 'btn-success' : 'btn-primary'}`}
                                                                            title={tieneAnalistaAsignado(ticket) ? `Chat con ${getAnalistaAsignado(ticket)}` : "Chat con analista"}
                                                                        >
                                                                            <i className={`fas ${tieneAnalistaAsignado(ticket) ? 'fa-signal' : 'fa-comments'}`}></i>
                                                                        </Link>
                                                                    </div>

                                                                    {/* Fila inferior: IA y Sugerencias */}
                                                                    <div className="d-flex gap-1">
                                                                        <div className="btn-group" role="group">
                                                                            <button
                                                                                className="btn btn-warning btn-sm dropdown-toggle"
                                                                                type="button"
                                                                                data-bs-toggle="dropdown"
                                                                                aria-expanded="false"
                                                                                title="Opciones de IA"
                                                                            >
                                                                                <i className="fas fa-robot"></i> IA
                                                                            </button>
                                                                            <ul className="dropdown-menu">
                                                                                <li>
                                                                                    <button
                                                                                        className="dropdown-item"
                                                                                        onClick={() => generarRecomendacion(ticket)}
                                                                                    >
                                                                                        <i className="fas fa-lightbulb me-2"></i>
                                                                                        Generar Recomendación
                                                                                    </button>
                                                                                </li>
                                                                                <li>
                                                                                    <Link
                                                                                        to={`/ticket/${ticket.id}/identificar-imagen`}
                                                                                        className="dropdown-item"
                                                                                    >
                                                                                        <i className="fas fa-camera me-2"></i>
                                                                                        Analizar Imagen
                                                                                    </Link>
                                                                                </li>
                                                                            </ul>
                                                                        </div>
                                                                        {ticketsConRecomendaciones.has(ticket.id) && (
                                                                            <Link
                                                                                to={`/ticket/${ticket.id}/recomendaciones-similares`}
                                                                                className="btn btn-outline-success btn-sm"
                                                                                title="Ver sugerencias disponibles"
                                                                            >
                                                                                <i className="fas fa-lightbulb"></i>
                                                                            </Link>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Create Ticket View */}
                    {activeView === 'create' && (
                        <>
                            <h1 className="hyper-page-title">Crear Nuevo Ticket</h1>

                            <div className="hyper-widget">
                                <div className="hyper-widget-header">
                                    <h3 className="hyper-widget-title">Formulario de Ticket</h3>
                                </div>

                                <form onSubmit={crearTicket}>
                                    <div className="row g-3">
                                        <div className="col-md-8">
                                            <label htmlFor="titulo" className="form-label">Título del Ticket *</label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                id="titulo"
                                                name="titulo"
                                                required
                                                placeholder="Describe brevemente el problema"
                                            />
                                        </div>
                                        <div className="col-md-4">
                                            <label htmlFor="prioridad" className="form-label">Prioridad *</label>
                                            <select className="form-select" id="prioridad" name="prioridad" required>
                                                <option value="">Seleccionar...</option>
                                                <option value="baja">Baja</option>
                                                <option value="media">Media</option>
                                                <option value="alta">Alta</option>
                                            </select>
                                        </div>
                                        <div className="col-12">
                                            <label htmlFor="descripcion" className="form-label">Descripción Detallada *</label>
                                            <textarea
                                                className="form-control"
                                                id="descripcion"
                                                name="descripcion"
                                                rows="4"
                                                required
                                                placeholder="Describe detalladamente el problema que necesitas resolver"
                                            ></textarea>
                                        </div>
                                        <div className="col-12">
                                            <ImageUpload
                                                onImageUpload={handleImageUpload}
                                                onImageRemove={handleImageRemove}
                                                currentImageUrl={ticketImageUrl}
                                            />
                                        </div>
                                        <div className="col-12">
                                            <button type="submit" className="btn btn-primary">
                                                <i className="fas fa-plus me-1"></i>
                                                Crear Ticket
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary ms-2"
                                                onClick={() => changeView('tickets')}
                                            >
                                                <i className="fas fa-arrow-left me-1"></i>
                                                Volver a Tickets
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </>
                    )}

                    {/* Profile View */}
                    {activeView === 'profile' && (
                        <>
                            <h1 className="hyper-page-title">Mi Perfil</h1>

                            <div className="hyper-widget">
                                <div className="hyper-widget-header">
                                    <h3 className="hyper-widget-title">Información Personal</h3>
                                </div>

                                <div className="row g-3">
                                    <div className="col-md-6">
                                        <label htmlFor="nombre" className="form-label">Nombre *</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            id="nombre"
                                            name="nombre"
                                            value={infoData.nombre}
                                            onChange={handleInfoChange}
                                            placeholder="Ingresa tu nombre"
                                            required
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label htmlFor="apellido" className="form-label">Apellido *</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            id="apellido"
                                            name="apellido"
                                            value={infoData.apellido}
                                            onChange={handleInfoChange}
                                            placeholder="Ingresa tu apellido"
                                            required
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label htmlFor="email" className="form-label">Email *</label>
                                        <input
                                            type="email"
                                            className="form-control"
                                            id="email"
                                            name="email"
                                            value={infoData.email}
                                            onChange={handleInfoChange}
                                            required
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label htmlFor="telefono" className="form-label">Teléfono *</label>
                                        <input
                                            type="tel"
                                            className="form-control"
                                            id="telefono"
                                            name="telefono"
                                            value={infoData.telefono}
                                            onChange={handleInfoChange}
                                            placeholder="Ingresa tu teléfono"
                                            required
                                        />
                                    </div>
                                    <div className="col-12">
                                        <label className="form-label">Ubicación *</label>
                                        <GoogleMapsLocation
                                            onLocationChange={handleLocationChange}
                                            initialAddress={infoData.direccion}
                                            initialLat={infoData.lat}
                                            initialLng={infoData.lng}
                                        />
                                    </div>
                                    <div className="col-12">
                                        <label className="form-label">Imagen de Perfil</label>
                                        <ImageUpload
                                            onImageUpload={handleClienteImageUpload}
                                            onImageRemove={handleClienteImageRemove}
                                            currentImageUrl={clienteImageUrl || userData?.url_imagen}
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label htmlFor="password" className="form-label">Nueva Contraseña (opcional)</label>
                                        <input
                                            type="password"
                                            className="form-control"
                                            id="password"
                                            name="password"
                                            value={infoData.password}
                                            onChange={handleInfoChange}
                                            minLength="6"
                                            placeholder="Dejar vacío para mantener la actual"
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label htmlFor="confirmPassword" className="form-label">Confirmar Nueva Contraseña</label>
                                        <input
                                            type="password"
                                            className="form-control"
                                            id="confirmPassword"
                                            name="confirmPassword"
                                            value={infoData.confirmPassword}
                                            onChange={handleInfoChange}
                                            minLength="6"
                                            placeholder="Solo si cambias la contraseña"
                                        />
                                    </div>
                                    <div className="col-12">
                                        <button
                                            className="btn btn-success"
                                            onClick={updateInfo}
                                            disabled={!infoData.nombre || !infoData.apellido || !infoData.email || !infoData.telefono || !infoData.direccion || updatingInfo}
                                        >
                                            {updatingInfo ? (
                                                <>
                                                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                                    Actualizando...
                                                </>
                                            ) : (
                                                <>
                                                    <i className="fas fa-save me-1"></i>
                                                    Guardar Información
                                                </>
                                            )}
                                        </button>
                                        <button
                                            className="btn btn-secondary ms-2"
                                            onClick={() => changeView('dashboard')}
                                        >
                                            <i className="fas fa-arrow-left me-1"></i>
                                            Volver al Dashboard
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Chat View */}
                    {activeView === 'chat' && (
                        <>
                            <h1 className="hyper-page-title">Chat con Analistas</h1>

                            <div className="hyper-widget">
                                <div className="hyper-widget-header">
                                    <h3 className="hyper-widget-title">Conversaciones Activas</h3>
                                </div>

                                <div className="text-center py-4">
                                    <i className="fas fa-comments fa-3x text-muted mb-3"></i>
                                    <p className="text-muted">Selecciona un ticket para iniciar una conversación</p>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => changeView('tickets')}
                                    >
                                        <i className="fas fa-ticket-alt me-1"></i>
                                        Ver Mis Tickets
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* VerTicketHD View */}
                    {(() => {
                        console.log('VerTicketHD render check:', {
                            activeView,
                            startsWithTicket: activeView.startsWith('ticket-'),
                            selectedTicketId,
                            shouldRender: activeView.startsWith('ticket-') && selectedTicketId
                        });
                        return activeView.startsWith('ticket-') && selectedTicketId;
                    })() && (
                            <VerTicketHD
                                ticketId={selectedTicketId}
                                tickets={tickets}
                                ticketsConRecomendaciones={ticketsConRecomendaciones}
                                onBack={() => changeView('tickets')}
                            />
                        )}

                </div>
            </div>
        </div>
    );
}

export default ClientePage;
