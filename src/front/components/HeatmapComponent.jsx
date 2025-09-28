import React, { useState, useEffect, useRef } from 'react';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import useGlobalReducer from '../hooks/useGlobalReducer';

const HeatmapComponent = () => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);
    const markerClustererRef = useRef(null);
    const infoWindowRef = useRef(null);
    const [heatmapData, setHeatmapData] = useState([]);
    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedMarker, setSelectedMarker] = useState(null);
    const [showMarkers, setShowMarkers] = useState(false); // Mapa de calor por defecto
    const [showHeatmap, setShowHeatmap] = useState(true); // Mapa de calor activado por defecto
    const [mapCenter, setMapCenter] = useState({ lat: 4.6097, lng: -74.0817 }); // Centrar en Colombia
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [mapInitialized, setMapInitialized] = useState(false);
    const [heatmapLayer, setHeatmapLayer] = useState(null);
    const { isLoaded, error: googleMapsError } = useGoogleMaps();
    const { store } = useGlobalReducer();

    // Función para obtener color del marcador según el estado
    const getMarkerColor = (estado) => {
        if (!estado) return '#6c757d'; // Gris por defecto si no hay estado

        const estadoLower = estado.toLowerCase().trim();
        console.log('Estado del ticket:', estado, '-> procesado:', estadoLower);

        switch (estadoLower) {
            case 'creado': return '#6c757d'; // Gris
            case 'en_espera': return '#ffc107'; // Amarillo
            case 'en_proceso': return '#0d6efd'; // Azul
            case 'solucionado': return '#198754'; // Verde
            case 'cerrado': return '#dc3545'; // Rojo
            default:
                console.log('Estado no reconocido:', estadoLower, 'usando gris por defecto');
                return '#6c757d';
        }
    };

    const fetchHeatmapData = async () => {
        try {
            setLoading(true);

            // Obtener token del store
            const token = store.auth.token;
            if (!token) {
                throw new Error('Token de autorización no encontrado');
            }

            // Cargar tickets directamente desde la API
            const backendUrl = import.meta.env.VITE_BACKEND_URL;
            console.log('Backend URL:', backendUrl);

            const response = await fetch(`${backendUrl}/api/tickets`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error en fetch tickets:', response.status, response.statusText, errorText);
                throw new Error(`Error ${response.status}: ${errorText}`);
            }

            const ticketsData = await response.json();
            console.log('Todos los tickets recibidos:', ticketsData);

            // Log detallado de la estructura de datos de los clientes
            ticketsData.forEach((ticket, index) => {
                console.log(`=== TICKET ${index + 1} (ID: ${ticket.id}) ===`);
                console.log('Ticket completo:', ticket);
                console.log('Cliente completo:', ticket.cliente);
                if (ticket.cliente) {
                    console.log('Propiedades del cliente:', Object.keys(ticket.cliente));
                    console.log('Valores del cliente:', Object.entries(ticket.cliente));
                }
                console.log('=====================================');
            });

            // Filtrar solo tickets que tengan cliente con ubicación geográfica válida
            const ticketsConUbicacion = ticketsData.filter(ticket => {
                // Buscar coordenadas en el ticket primero, luego en el cliente
                // Usar los nombres correctos: latitude/longitude (no latitud/longitud)
                const latitud = ticket.latitud || ticket.cliente?.latitude;
                const longitud = ticket.longitud || ticket.cliente?.longitude;

                const tieneUbicacion = latitud && longitud &&
                    latitud !== 0 && longitud !== 0;

                if (!tieneUbicacion) {
                    console.log('Ticket sin ubicación válida:', {
                        id: ticket.id,
                        titulo: ticket.titulo,
                        ticket_latitud: ticket.latitud,
                        ticket_longitud: ticket.longitud,
                        cliente_latitude: ticket.cliente?.latitude,
                        cliente_longitude: ticket.cliente?.longitude,
                        cliente_direccion: ticket.cliente?.direccion
                    });
                } else {
                    console.log('✅ Ticket con ubicación válida:', {
                        id: ticket.id,
                        titulo: ticket.titulo,
                        latitud,
                        longitud,
                        cliente_direccion: ticket.cliente?.direccion
                    });
                }

                return tieneUbicacion;
            });

            console.log('Tickets con ubicación válida:', ticketsConUbicacion.length, 'de', ticketsData.length);

            // Transformar datos para compatibilidad con el heatmap
            const transformedData = ticketsConUbicacion.map(ticket => {
                // Usar coordenadas del ticket o del cliente con los nombres correctos
                const latitud = ticket.latitud || ticket.cliente?.latitude;
                const longitud = ticket.longitud || ticket.cliente?.longitude;

                console.log('🎯 Ticket procesado para el mapa:', {
                    id: ticket.id,
                    titulo: ticket.titulo,
                    coordenadas: { lat: latitud, lng: longitud },
                    cliente_direccion: ticket.cliente?.direccion
                });

                return {
                    lat: parseFloat(latitud),
                    lng: parseFloat(longitud),
                    ticket_id: ticket.id,
                    ticket_titulo: ticket.titulo,
                    ticket_descripcion: ticket.descripcion,
                    ticket_estado: ticket.estado,
                    ticket_prioridad: ticket.prioridad,
                    ticket_fecha_creacion: ticket.fecha_creacion,
                    cliente_nombre: ticket.cliente?.nombre || 'N/A',
                    cliente_apellido: ticket.cliente?.apellido || '',
                    cliente_email: ticket.cliente?.email || 'N/A',
                    cliente_direccion: ticket.cliente?.direccion || 'N/A',
                    cliente_telefono: ticket.cliente?.telefono || null
                };
            });

            console.log('Datos transformados:', transformedData);

            setRawData(transformedData);

            if (transformedData.length === 0) {
                console.warn('No hay tickets con ubicación geográfica válida');
                setError('No se encontraron tickets con ubicación geográfica. Los clientes necesitan tener coordenadas de latitud y longitud válidas en sus perfiles.');
            } else {
                // Procesar datos para el heatmap profesional con intensidad basada en densidad
                const processedData = transformedData.map((item, index) => {
                    // Calcular peso basado en prioridad y estado del ticket
                    let weight = 1;

                    // Aumentar peso según prioridad
                    if (item.ticket_prioridad === 'alta') weight += 3;
                    else if (item.ticket_prioridad === 'media') weight += 2;
                    else if (item.ticket_prioridad === 'baja') weight += 1;

                    // Aumentar peso según estado crítico
                    if (item.ticket_estado === 'en_proceso') weight += 2;
                    else if (item.ticket_estado === 'en_espera') weight += 1.5;
                    else if (item.ticket_estado === 'creado') weight += 1;

                    // Añadir variación geográfica sutil para evitar superposición exacta
                    const latVariation = (Math.random() - 0.5) * 0.001; // ±0.0005 grados
                    const lngVariation = (Math.random() - 0.5) * 0.001;

                    return {
                        location: new window.google.maps.LatLng(
                            item.lat + latVariation,
                            item.lng + lngVariation
                        ),
                        weight: Math.max(0.5, Math.min(10, weight))
                    };
                });

                setHeatmapData(processedData);
                setError(null);
            }

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isLoaded && !googleMapsError) {
            fetchHeatmapData();
        }
    }, [isLoaded, googleMapsError]);

    // Asegurar que el mapRef esté disponible después del montaje
    useEffect(() => {
        const checkMapRef = () => {
            if (mapRef.current && isLoaded && !googleMapsError && !mapInstanceRef.current) {
                initializeMap();
            }
        };

        // Verificar inmediatamente
        checkMapRef();

        // Verificar después de un pequeño delay
        const timeoutId = setTimeout(checkMapRef, 200);

        return () => clearTimeout(timeoutId);
    }, [isLoaded, googleMapsError]);

    // Escuchar nuevos tickets en tiempo real
    useEffect(() => {
        const socket = store.websocket.socket;
        if (socket) {
            const handleNewTicket = (data) => {
                // Recargar datos del mapa cuando se cree un nuevo ticket
                fetchHeatmapData();
            };

            socket.on('nuevo_ticket', handleNewTicket);
            socket.on('nuevo_ticket_disponible', handleNewTicket);

            return () => {
                socket.off('nuevo_ticket', handleNewTicket);
                socket.off('nuevo_ticket_disponible', handleNewTicket);
            };
        }
    }, [store.websocket.socket]);

    const initializeMap = () => {
        if (!window.google || !window.google.maps) {
            return;
        }

        if (!mapRef.current) {
            setTimeout(() => {
                if (mapRef.current && !mapInstanceRef.current) {
                    initializeMap();
                }
            }, 100);
            return;
        }

        // Evitar reinicialización si el mapa ya existe
        if (mapInstanceRef.current) {
            return;
        }

        try {

            const map = new window.google.maps.Map(mapRef.current, {
                center: mapCenter,
                zoom: 6, // Zoom inicial para Colombia
                mapTypeControl: true,
                streetViewControl: true,
                fullscreenControl: true,
                zoomControl: true,
                // Configuraciones para suavizar la carga
                gestureHandling: 'cooperative',
                zoomControlOptions: {
                    position: window.google.maps.ControlPosition.TOP_RIGHT
                },
                // Configuraciones adicionales para mejor rendimiento
                disableDefaultUI: false,
                clickableIcons: true,
                keyboardShortcuts: true,
                scrollwheel: true,
                disableDoubleClickZoom: false,
                styles: [
                    {
                        featureType: 'poi',
                        elementType: 'labels',
                        stylers: [{ visibility: 'off' }]
                    }
                ]
            });

            // Guardar referencia del mapa
            mapInstanceRef.current = map;

            // Crear InfoWindow
            infoWindowRef.current = new window.google.maps.InfoWindow();

            // Cargar MarkerClusterer si está disponible
            if (window.MarkerClusterer) {
                markerClustererRef.current = new window.MarkerClusterer(map, [], {
                    imagePath: 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m',
                    gridSize: 20, // Menor para agrupar menos
                    maxZoom: 18, // Mayor zoom para mostrar marcadores individuales
                    minimumClusterSize: 3 // Mínimo 3 marcadores para agrupar
                });
            }

            // Crear capa de calor profesional solo si la librería de visualización está disponible
            if (window.google && window.google.maps && window.google.maps.visualization && window.google.maps.visualization.HeatmapLayer) {
                const heatmap = new window.google.maps.visualization.HeatmapLayer({
                    data: [],
                    map: null, // Se activará cuando se carguen los datos
                    radius: 50, // Radio de influencia de cada punto
                    opacity: 0.8, // Opacidad del calor
                    gradient: [
                        'rgba(0, 255, 255, 0)',      // Transparente en el centro
                        'rgba(0, 255, 255, 1)',      // Cian
                        'rgba(0, 191, 255, 1)',      // Azul claro
                        'rgba(0, 127, 255, 1)',      // Azul
                        'rgba(0, 63, 255, 1)',       // Azul medio
                        'rgba(0, 0, 255, 1)',        // Azul puro
                        'rgba(0, 0, 223, 1)',        // Azul oscuro
                        'rgba(0, 0, 191, 1)',        // Azul más oscuro
                        'rgba(0, 0, 159, 1)',        // Azul muy oscuro
                        'rgba(0, 0, 127, 1)',        // Azul marino
                        'rgba(63, 0, 91, 1)',        // Púrpura
                        'rgba(127, 0, 63, 1)',       // Magenta
                        'rgba(191, 0, 31, 1)',       // Rojo oscuro
                        'rgba(255, 0, 0, 1)'         // Rojo puro
                    ],
                    dissipating: true, // Dispersión del calor
                    maxIntensity: 10   // Intensidad máxima
                });

                setHeatmapLayer(heatmap);
                console.log('🔥 Capa de calor profesional creada exitosamente');
            } else {
                console.warn('⚠️ Librería de visualización de Google Maps no disponible. Mapa de calor deshabilitado.');
                setHeatmapLayer(null);
            }

            setMapInitialized(true);

            // Forzar redibujado del mapa
            setTimeout(() => {
                if (mapInstanceRef.current) {
                    window.google.maps.event.trigger(mapInstanceRef.current, 'resize');
                }
            }, 100);

        } catch (error) {
            console.error('Error al crear el mapa:', error);
        }

        // Los marcadores se crearán en el useEffect de actualización de marcadores
        // para evitar problemas de scope y timing
    };

    // Inicializar mapa cuando Google Maps esté listo Y el mapRef esté disponible
    useEffect(() => {
        if (isLoaded && !googleMapsError && !mapInstanceRef.current && mapRef.current) {
            initializeMap();
        } else if (isLoaded && !googleMapsError && !mapInstanceRef.current && !mapRef.current) {
            // Reintentar después de un delay más largo
            const timeoutId = setTimeout(() => {
                if (mapRef.current && !mapInstanceRef.current) {
                    initializeMap();
                }
            }, 500);

            return () => clearTimeout(timeoutId);
        }
    }, [isLoaded, googleMapsError, mapRef.current]);

    // Actualizar marcadores y mapa de calor cuando cambien los datos
    useEffect(() => {
        if (mapInstanceRef.current && heatmapData.length > 0) {
            // Actualizar capa de calor profesional
            if (heatmapLayer) {
                heatmapLayer.setData(heatmapData);
                heatmapLayer.setMap(showHeatmap ? mapInstanceRef.current : null);
            }

            // Limpiar marcadores existentes
            markersRef.current.forEach(marker => {
                marker.setMap(null);
            });
            markersRef.current = [];

            // Limpiar MarkerClusterer
            if (markerClustererRef.current) {
                markerClustererRef.current.clearMarkers();
            }

            // Crear nuevos marcadores si están habilitados
            if (showMarkers && rawData.length > 0) {
                const newMarkers = [];

                rawData.forEach((item, index) => {
                    const marker = new window.google.maps.Marker({
                        position: { lat: item.lat, lng: item.lng },
                        map: null, // No agregar directamente al mapa, será manejado por MarkerClusterer
                        title: `Ticket #${item.ticket_id} - ${item.ticket_titulo}`,
                        icon: {
                            path: window.google.maps.SymbolPath.CIRCLE,
                            fillColor: '#dc3545', // ROJO para todos los tickets
                            fillOpacity: 0.8,
                            strokeColor: '#ffffff',
                            strokeWeight: 2,
                            scale: 10 // Más grande para mejor visibilidad
                        },
                        animation: window.google.maps.Animation.DROP
                    });

                    // Crear contenido del InfoWindow
                    const infoContent = `
                        <div style="max-width: 300px; font-family: Arial, sans-serif;">
                            <div style="border-bottom: 1px solid #dee2e6; padding-bottom: 10px; margin-bottom: 10px;">
                                <h6 style="margin: 0; color: #495057; font-weight: bold;">${item.ticket_titulo}</h6>
                            </div>
                            <div style="margin-bottom: 8px;">
                                <strong>Estado:</strong> 
                                <span style="color: ${getMarkerColor(item.ticket_estado)}; font-weight: bold;">
                                    ${item.ticket_estado.toUpperCase()}
                                </span>
                            </div>
                            <div style="margin-bottom: 8px;">
                                <strong>Descripción:</strong><br>
                                <span style="color: #6c757d; font-size: 0.9em;">
                                    ${item.ticket_descripcion ? item.ticket_descripcion.substring(0, 100) + '...' : 'Sin descripción'}
                                </span>
                            </div>
                            <div style="margin-bottom: 8px;">
                                <strong>Fecha de Creación:</strong><br>
                                <span style="color: #6c757d; font-size: 0.9em;">
                                    ${new Date(item.ticket_fecha_creacion).toLocaleDateString('es-CO', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                                </span>
                            </div>
                            <div style="margin-bottom: 8px;">
                                <strong>Prioridad:</strong> 
                                <span style="color: ${item.ticket_prioridad === 'alta' ? '#dc3545' : item.ticket_prioridad === 'media' ? '#ffc107' : '#198754'}; font-weight: bold;">
                                    ${item.ticket_prioridad.toUpperCase()}
                                </span>
                            </div>
                            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #dee2e6;">
                                <small style="color: #6c757d;">
                                    ID: ${item.ticket_id} | Cliente: ${item.cliente_nombre} ${item.cliente_apellido || ''}
                                </small>
                            </div>
                        </div>
                    `;

                    // Agregar evento de clic al marcador
                    marker.addListener('click', () => {
                        if (infoWindowRef.current) {
                            infoWindowRef.current.setContent(infoContent);
                            infoWindowRef.current.open(mapInstanceRef.current, marker);
                        }
                    });

                    newMarkers.push(marker);
                });

                // Guardar referencias de los marcadores
                markersRef.current = newMarkers;

                // Agregar marcadores al clusterer si está disponible
                if (markerClustererRef.current) {
                    markerClustererRef.current.addMarkers(newMarkers);
                } else {
                    // Si no hay clusterer, agregar marcadores directamente al mapa
                    newMarkers.forEach(marker => {
                        marker.setMap(mapInstanceRef.current);
                    });
                }

                // También agregar marcadores directamente al mapa para asegurar visibilidad
                newMarkers.forEach(marker => {
                    marker.setMap(mapInstanceRef.current);
                });

                // Ajustar el zoom para mostrar todos los marcadores
                if (newMarkers.length > 0) {
                    const bounds = new window.google.maps.LatLngBounds();
                    newMarkers.forEach(marker => {
                        bounds.extend(marker.getPosition());
                    });
                    mapInstanceRef.current.fitBounds(bounds);
                }
            }
        }
    }, [heatmapData, showMarkers, showHeatmap, rawData, heatmapLayer]);

    const goToLocation = (lat, lng) => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.setCenter({ lat, lng });
            mapInstanceRef.current.setZoom(15);
        }
    };

    const centerOnAllPoints = () => {
        if (rawData.length === 0 || !mapInstanceRef.current) return;

        setIsTransitioning(true);

        const bounds = new window.google.maps.LatLngBounds();
        rawData.forEach(item => {
            bounds.extend(new window.google.maps.LatLng(item.lat, item.lng));
        });

        mapInstanceRef.current.fitBounds(bounds);

        // Ajustar el zoom si es necesario
        const listener = window.google.maps.event.addListener(mapInstanceRef.current, 'bounds_changed', () => {
            if (mapInstanceRef.current.getZoom() > 15) {
                mapInstanceRef.current.setZoom(15);
            }
            window.google.maps.event.removeListener(listener);
            setIsTransitioning(false);
        });
    };

    const toggleMarkers = () => {
        setIsTransitioning(true);
        setShowMarkers(!showMarkers);
        // Transición suave
        setTimeout(() => {
            setIsTransitioning(false);
        }, 300);
    };

    const toggleHeatmap = () => {
        setIsTransitioning(true);
        setShowHeatmap(!showHeatmap);
        if (heatmapLayer) {
            heatmapLayer.setMap(!showHeatmap ? mapInstanceRef.current : null);
        } else {
            console.warn('⚠️ No se puede alternar mapa de calor: capa no disponible');
        }
        // Transición suave
        setTimeout(() => {
            setIsTransitioning(false);
        }, 300);
    };

    if (!isLoaded) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ height: '500px' }}>
                <div className="text-center">
                    <div className="spinner-border text-primary mb-3" role="status">
                        <span className="visually-hidden">Cargando mapa...</span>
                    </div>
                    <p className="text-muted">Cargando Google Maps...</p>
                </div>
            </div>
        );
    }

    if (googleMapsError) {
        return (
            <div className="alert alert-danger" role="alert">
                <i className="fas fa-exclamation-triangle me-2"></i>
                Error al cargar Google Maps: {googleMapsError.message}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ height: '500px' }}>
                <div className="text-center">
                    <div className="spinner-border text-primary mb-3" role="status">
                        <span className="visually-hidden">Cargando datos...</span>
                    </div>
                    <p className="text-muted">Cargando datos del mapa de calor...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="alert alert-warning" role="alert">
                <i className="fas fa-exclamation-triangle me-2"></i>
                <strong>Información del Mapa de Calor:</strong> {error}
                <hr />
                <small>
                    <strong>Para que aparezcan los tickets en el mapa:</strong><br />
                    • Los clientes deben tener coordenadas de latitud y longitud en su perfil<br />
                    • Las direcciones deben estar geocodificadas (convertidas a coordenadas)<br />
                    • Los tickets heredan la ubicación del cliente que los creó<br />
                    • Cada ticket aparece como un punto rojo en la ubicación del cliente
                </small>
            </div>
        );
    }

    return (
        <div className="heatmap-container">
            {/* Información del mapa */}
            <div className="row mb-3">
                <div className="col-12">
                    <div className="d-flex justify-content-between align-items-center">
                        <div>
                            <h5 className="mb-1">
                                <i className="fas fa-map-marker-alt me-2 text-primary"></i>
                                Mapa de Calor - Tickets por Ubicación del Cliente
                            </h5>
                            <small className="text-muted">
                                {rawData.length} tickets ubicados según la dirección del cliente
                            </small>
                        </div>
                        <div className="d-flex gap-3">
                            {/* Leyenda del mapa de calor profesional */}
                            <div className="d-flex align-items-center gap-2">
                                <div className="d-flex align-items-center gap-1">
                                    <div style={{
                                        width: '20px',
                                        height: '20px',
                                        background: 'linear-gradient(45deg, rgba(0,255,255,0.3), rgba(255,0,0,1))',
                                        borderRadius: '50%',
                                        border: '2px solid #fff',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                                    }}></div>
                                    <small><strong>Mapa de Calor</strong></small>
                                </div>
                                <small className="text-muted">• Intensidad basada en prioridad y estado</small>
                            </div>

                            {/* Información de densidad */}
                            <div className="d-flex align-items-center gap-1">
                                <i className="fas fa-info-circle text-info"></i>
                                <small className="text-muted">
                                    {rawData.length} tickets • Densidad: {rawData.length > 0 ? 'Alta' : 'Baja'}
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="d-flex justify-content-between align-items-center mb-3">
                <div className="btn-group" role="group">
                    <button
                        type="button"
                        className={`btn ${heatmapLayer ? (showHeatmap ? 'btn-primary' : 'btn-outline-primary') : 'btn-outline-secondary'} btn-sm ${isTransitioning ? 'disabled' : ''}`}
                        onClick={toggleHeatmap}
                        disabled={isTransitioning || !heatmapLayer}
                    >
                        <i className="fas fa-fire me-1"></i>
                        {isTransitioning ? 'Procesando...' :
                            !heatmapLayer ? 'Mapa de Calor N/A' :
                                (showHeatmap ? 'Mapa de Calor ON' : 'Mapa de Calor OFF')}
                    </button>
                    <button
                        type="button"
                        className={`btn ${showMarkers ? 'btn-success' : 'btn-outline-success'} btn-sm ${isTransitioning ? 'disabled' : ''}`}
                        onClick={toggleMarkers}
                        disabled={isTransitioning}
                    >
                        <i className="fas fa-map-marker-alt me-1"></i>
                        {isTransitioning ? 'Procesando...' : (showMarkers ? 'Marcadores ON' : 'Marcadores OFF')}
                    </button>
                    <button
                        type="button"
                        className={`btn btn-outline-info btn-sm ${isTransitioning ? 'disabled' : ''}`}
                        onClick={centerOnAllPoints}
                        disabled={isTransitioning}
                    >
                        <i className="fas fa-expand-arrows-alt me-1"></i>
                        {isTransitioning ? 'Centrando...' : 'Ver Todos'}
                    </button>
                </div>
            </div>

            <div className="map-container" style={{ height: '500px', width: '100%', position: 'relative' }}>
                {!mapInitialized && (
                    <div className="d-flex justify-content-center align-items-center" style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: '#f8f9fa',
                        borderRadius: '8px',
                        zIndex: 1000
                    }}>
                        <div className="text-center">
                            <div className="spinner-border text-primary mb-3" role="status">
                                <span className="visually-hidden">Cargando mapa...</span>
                            </div>
                            <p className="text-muted">Inicializando mapa...</p>
                        </div>
                    </div>
                )}
                <div
                    ref={mapRef}
                    style={{
                        height: '100%',
                        width: '100%',
                        borderRadius: '8px',
                        backgroundColor: '#e9ecef'
                    }}
                />
            </div>

            {/* Tarjeta de información del cliente oculta */}

            {/* Estadísticas adicionales */}
            <div className="row mt-3">
                <div className="col-md-3">
                    <div className="card bg-light">
                        <div className="card-body text-center py-2">
                            <h6 className="card-title mb-1">{rawData.length}</h6>
                            <small className="text-muted">Total Tickets</small>
                        </div>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card bg-light">
                        <div className="card-body text-center py-2">
                            <h6 className="card-title mb-1">
                                {rawData.filter(t => t.ticket_estado.toLowerCase() === 'en_proceso').length}
                            </h6>
                            <small className="text-muted">En Proceso</small>
                        </div>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card bg-light">
                        <div className="card-body text-center py-2">
                            <h6 className="card-title mb-1">
                                {rawData.filter(t => t.ticket_estado.toLowerCase() === 'solucionado').length}
                            </h6>
                            <small className="text-muted">Solucionados</small>
                        </div>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card bg-light">
                        <div className="card-body text-center py-2">
                            <h6 className="card-title mb-1">
                                {rawData.filter(t => t.ticket_estado.toLowerCase() === 'cerrado').length}
                            </h6>
                            <small className="text-muted">Cerrados</small>
                        </div>
                    </div>
                </div>
            </div>

            {rawData.length > 0 && (
                <div className="mt-3">
                    <h6>
                        <i className="fas fa-list me-2"></i>
                        Sugerencias de Navegación
                    </h6>
                    <div className="row">
                        {rawData.slice(0, 6).map((item, index) => (
                            <div key={index} className="col-md-4 mb-2">
                                <div className="card h-100">
                                    <div className="card-body p-2">
                                        <h6 className="card-title small mb-1">Ticket #{item.ticket_id}</h6>
                                        <p className="card-text small text-muted mb-1">{item.ticket_titulo}</p>
                                        <p className="card-text small text-muted mb-1">
                                            <strong>Cliente:</strong> {item.cliente_nombre} {item.cliente_apellido}
                                        </p>
                                        <button
                                            className="btn btn-outline-primary btn-sm w-100"
                                            onClick={() => goToLocation(item.lat, item.lng)}
                                        >
                                            <i className="fas fa-map-marker-alt me-1"></i>
                                            Ir a ubicación
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default HeatmapComponent;