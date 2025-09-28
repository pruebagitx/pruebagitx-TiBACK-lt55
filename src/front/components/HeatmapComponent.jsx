import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import useGlobalReducer from '../hooks/useGlobalReducer';

const HeatmapComponent = () => {
    // Referencias
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);
    const markerClustererRef = useRef(null);
    const infoWindowRef = useRef(null);
    const heatmapLayerRef = useRef(null);

    // Estados principales
    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showMarkers, setShowMarkers] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(true);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [mapInitialized, setMapInitialized] = useState(false);

    // Hooks
    const { isLoaded, error: googleMapsError } = useGoogleMaps();
    const { store } = useGlobalReducer();

    // Configuración del mapa
    const mapCenter = useMemo(() => ({ lat: 4.6097, lng: -74.0817 }), []);
    const mapConfig = useMemo(() => ({
        center: mapCenter,
        zoom: 6,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        zoomControlOptions: {
            position: window.google?.maps?.ControlPosition?.TOP_RIGHT
        },
        disableDefaultUI: false,
        clickableIcons: true,
        keyboardShortcuts: true,
        scrollwheel: true,
        disableDoubleClickZoom: false,
        styles: [{
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
        }]
    }), [mapCenter]);

    // Configuración del gradiente de calor - 2 tonos de azul y 1 rojo (configuración original)
    const heatmapGradient = useMemo(() => [
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
    ], []);

    // Función optimizada para obtener color del marcador
    const getMarkerColor = useCallback((estado) => {
        if (!estado) return '#6c757d';
        const estadoLower = estado.toLowerCase().trim();
        const colorMap = {
            'creado': '#6c757d',
            'en_espera': '#ffc107',
            'en_proceso': '#0d6efd',
            'solucionado': '#198754',
            'cerrado': '#dc3545'
        };
        return colorMap[estadoLower] || '#6c757d';
    }, []);

    // Función optimizada para calcular peso del heatmap
    const calculateHeatmapWeight = useCallback((item) => {
        let weight = 1; // Peso base original
        
        // Peso por prioridad
        const priorityWeights = { 'alta': 3, 'media': 2, 'baja': 1 };
        weight += priorityWeights[item.ticket_prioridad] || 0;
        
        // Peso por estado
        const stateWeights = { 'en_proceso': 2, 'en_espera': 1.5, 'creado': 1 };
        weight += stateWeights[item.ticket_estado] || 0;
        
        return Math.max(0.5, Math.min(10, weight)); // Rango original
    }, []);

    // Función optimizada para procesar datos
    const processTicketData = useCallback((ticketsData) => {
        return ticketsData
            .filter(ticket => {
                const lat = ticket.latitud || ticket.cliente?.latitude;
                const lng = ticket.longitud || ticket.cliente?.longitude;
                return lat && lng && lat !== 0 && lng !== 0;
            })
            .map(ticket => {
                const lat = ticket.latitud || ticket.cliente?.latitude;
                const lng = ticket.longitud || ticket.cliente?.longitude;

                return {
                    lat: parseFloat(lat),
                    lng: parseFloat(lng),
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
    }, []);

    // Función optimizada para crear datos del heatmap
    const createHeatmapData = useCallback((transformedData) => {
        return transformedData.map((item) => {
            // Añadir variación geográfica sutil para evitar superposición exacta
            const latVariation = (Math.random() - 0.5) * 0.001; // ±0.0005 grados
            const lngVariation = (Math.random() - 0.5) * 0.001;
            
            return {
                location: new window.google.maps.LatLng(
                    item.lat + latVariation,
                    item.lng + lngVariation
                ),
                weight: calculateHeatmapWeight(item)
            };
        });
    }, [calculateHeatmapWeight]);

    // Función optimizada para crear InfoWindow content
    const createInfoContent = useCallback((item) => {
        return `
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
    }, [getMarkerColor]);

    // Función optimizada para cargar datos
    const fetchHeatmapData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const token = store.auth.token;
            if (!token) {
                throw new Error('Token de autorización no encontrado');
            }

            const backendUrl = import.meta.env.VITE_BACKEND_URL;
            const response = await fetch(`${backendUrl}/api/tickets`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const ticketsData = await response.json();
            const transformedData = processTicketData(ticketsData);

            setRawData(transformedData);

            if (transformedData.length === 0) {
                setError('No se encontraron tickets con ubicación geográfica. Los clientes necesitan tener coordenadas de latitud y longitud válidas en sus perfiles.');
            }

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [store.auth.token, processTicketData]);

    // Función optimizada para inicializar el mapa
    const initializeMap = useCallback(() => {
        console.log('🔄 Intentando inicializar mapa...', {
            googleMaps: !!window.google?.maps,
            mapRef: !!mapRef.current,
            mapInstance: !!mapInstanceRef.current,
            isLoaded,
            googleMapsError
        });

        if (!window.google?.maps) {
            console.log('❌ Google Maps no está disponible');
            return;
        }

        if (!mapRef.current) {
            console.log('❌ mapRef no está disponible');
            return;
        }

        if (mapInstanceRef.current) {
            console.log('✅ Mapa ya está inicializado');
            return;
        }

        try {
            console.log('🚀 Creando mapa...');
            const map = new window.google.maps.Map(mapRef.current, mapConfig);
            mapInstanceRef.current = map;

            // Crear InfoWindow
            infoWindowRef.current = new window.google.maps.InfoWindow();

            // Crear MarkerClusterer
            if (window.MarkerClusterer) {
                markerClustererRef.current = new window.MarkerClusterer(map, [], {
                    imagePath: 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m',
                    gridSize: 20,
                    maxZoom: 18,
                    minimumClusterSize: 3
                });
            }

            // Crear HeatmapLayer
            if (window.google.maps.visualization?.HeatmapLayer) {
                heatmapLayerRef.current = new window.google.maps.visualization.HeatmapLayer({
                    data: [],
                    map: null,
                    radius: 50, // Radio original
                    opacity: 0.8, // Opacidad original
                    gradient: heatmapGradient,
                    dissipating: true, // Dispersión original
                    maxIntensity: 10 // Intensidad máxima original
                });
                console.log('🔥 HeatmapLayer creado');
            } else {
                console.warn('⚠️ HeatmapLayer no disponible');
            }

            setMapInitialized(true);
            console.log('✅ Mapa inicializado exitosamente');

            // Forzar redibujado
            setTimeout(() => {
                if (mapInstanceRef.current) {
                    window.google.maps.event.trigger(mapInstanceRef.current, 'resize');
                }
            }, 100);

        } catch (error) {
            console.error('❌ Error al crear el mapa:', error);
        }
    }, [mapConfig, heatmapGradient, isLoaded, googleMapsError]);

    // Función optimizada para actualizar marcadores y heatmap
    const updateMapData = useCallback(() => {
        if (!mapInstanceRef.current || !rawData.length) return;

        // Actualizar heatmap
        if (heatmapLayerRef.current && showHeatmap) {
            const heatmapData = createHeatmapData(rawData);
            heatmapLayerRef.current.setData(heatmapData);
            heatmapLayerRef.current.setMap(mapInstanceRef.current);
        } else if (heatmapLayerRef.current) {
            heatmapLayerRef.current.setMap(null);
        }

        // Limpiar marcadores existentes
        markersRef.current.forEach(marker => marker.setMap(null));
        markersRef.current = [];

        if (markerClustererRef.current) {
            markerClustererRef.current.clearMarkers();
        }

        // Crear nuevos marcadores si están habilitados
        if (showMarkers) {
            const newMarkers = rawData.map((item) => {
                const marker = new window.google.maps.Marker({
                    position: { lat: item.lat, lng: item.lng },
                    map: null,
                    title: `Ticket #${item.ticket_id} - ${item.ticket_titulo}`,
                    icon: {
                        path: window.google.maps.SymbolPath.CIRCLE,
                        fillColor: '#dc3545',
                        fillOpacity: 0.8,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                        scale: 10
                    },
                    animation: window.google.maps.Animation.DROP
                });

                marker.addListener('click', () => {
                    if (infoWindowRef.current) {
                        infoWindowRef.current.setContent(createInfoContent(item));
                        infoWindowRef.current.open(mapInstanceRef.current, marker);
                    }
                });

                return marker;
            });

            markersRef.current = newMarkers;

            if (markerClustererRef.current) {
                markerClustererRef.current.addMarkers(newMarkers);
            } else {
                newMarkers.forEach(marker => marker.setMap(mapInstanceRef.current));
            }

            // Ajustar bounds
            if (newMarkers.length > 0) {
                const bounds = new window.google.maps.LatLngBounds();
                newMarkers.forEach(marker => bounds.extend(marker.getPosition()));
                mapInstanceRef.current.fitBounds(bounds);
            }
        }
    }, [rawData, showMarkers, showHeatmap, createHeatmapData, createInfoContent]);

    // Función optimizada para centrar en todos los puntos
    const centerOnAllPoints = useCallback(() => {
        if (!rawData.length || !mapInstanceRef.current) return;

        setIsTransitioning(true);
        const bounds = new window.google.maps.LatLngBounds();
        rawData.forEach(item => {
            bounds.extend(new window.google.maps.LatLng(item.lat, item.lng));
        });

        mapInstanceRef.current.fitBounds(bounds);

        const listener = window.google.maps.event.addListener(mapInstanceRef.current, 'bounds_changed', () => {
            if (mapInstanceRef.current.getZoom() > 15) {
                mapInstanceRef.current.setZoom(15);
            }
            window.google.maps.event.removeListener(listener);
            setIsTransitioning(false);
        });
    }, [rawData]);

    // Función optimizada para ir a ubicación
    const goToLocation = useCallback((lat, lng) => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.setCenter({ lat, lng });
            mapInstanceRef.current.setZoom(15);
        }
    }, []);

    // Función optimizada para alternar marcadores
    const toggleMarkers = useCallback(() => {
        setIsTransitioning(true);
        setShowMarkers(!showMarkers);
        setTimeout(() => setIsTransitioning(false), 300);
    }, [showMarkers]);

    // Función optimizada para alternar heatmap
    const toggleHeatmap = useCallback(() => {
        setIsTransitioning(true);
        setShowHeatmap(!showHeatmap);
        setTimeout(() => setIsTransitioning(false), 300);
    }, [showHeatmap]);

    // Estadísticas calculadas
    const stats = useMemo(() => ({
        total: rawData.length,
        enProceso: rawData.filter(t => t.ticket_estado.toLowerCase() === 'en_proceso').length,
        solucionados: rawData.filter(t => t.ticket_estado.toLowerCase() === 'solucionado').length,
        cerrados: rawData.filter(t => t.ticket_estado.toLowerCase() === 'cerrado').length
    }), [rawData]);

    // Efectos optimizados
    useEffect(() => {
        if (isLoaded && !googleMapsError) {
            fetchHeatmapData();
        }
    }, [isLoaded, googleMapsError, fetchHeatmapData]);

    // Inicializar mapa cuando Google Maps esté listo
    useEffect(() => {
        if (isLoaded && !googleMapsError) {
            let attempts = 0;
            const maxAttempts = 50; // Máximo 5 segundos (50 * 100ms)

            // Esperar a que el DOM esté completamente renderizado
            const initializeWithDelay = () => {
                attempts++;

                if (mapRef.current && !mapInstanceRef.current) {
                    console.log('🔄 Inicializando mapa con mapRef disponible...');
                    initializeMap();
                } else if (!mapRef.current && attempts < maxAttempts) {
                    console.log(`⏳ mapRef aún no disponible (intento ${attempts}/${maxAttempts}), reintentando en 100ms...`);
                    setTimeout(initializeWithDelay, 100);
                } else if (attempts >= maxAttempts) {
                    console.error('❌ Timeout: No se pudo obtener mapRef después de 5 segundos');
                }
            };

            // Iniciar el proceso de inicialización
            initializeWithDelay();
        }
    }, [isLoaded, googleMapsError, initializeMap]);

    // Actualizar datos del mapa cuando esté inicializado
    useEffect(() => {
        if (mapInitialized && rawData.length > 0) {
            updateMapData();
        }
    }, [mapInitialized, rawData, updateMapData]);

    // Efecto adicional para cuando mapRef se vuelve disponible (backup)
    useEffect(() => {
        if (isLoaded && !googleMapsError && mapRef.current && !mapInstanceRef.current) {
            console.log('🔄 mapRef disponible (backup), inicializando mapa...');
            initializeMap();
        }
    }, [mapRef.current, isLoaded, googleMapsError, initializeMap]);

    useEffect(() => {
        const socket = store.websocket.socket;
        if (socket) {
            const handleNewTicket = () => fetchHeatmapData();
            socket.on('nuevo_ticket', handleNewTicket);
            socket.on('nuevo_ticket_disponible', handleNewTicket);
            return () => {
                socket.off('nuevo_ticket', handleNewTicket);
                socket.off('nuevo_ticket_disponible', handleNewTicket);
            };
        }
    }, [store.websocket.socket, fetchHeatmapData]);

    // Renderizado de estados de carga
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
                                {stats.total} tickets ubicados según la dirección del cliente
                            </small>
                        </div>
                        <div className="d-flex gap-3">
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
                            <div className="d-flex align-items-center gap-1">
                                <i className="fas fa-info-circle text-info"></i>
                                <small className="text-muted">
                                    {stats.total} tickets • Densidad: {stats.total > 0 ? 'Alta' : 'Baja'}
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Controles */}
            <div className="d-flex justify-content-between align-items-center mb-3">
                <div className="btn-group" role="group">
                    <button
                        type="button"
                        className={`btn ${heatmapLayerRef.current ? (showHeatmap ? 'btn-primary' : 'btn-outline-primary') : 'btn-outline-secondary'} btn-sm ${isTransitioning ? 'disabled' : ''}`}
                        onClick={toggleHeatmap}
                        disabled={isTransitioning || !heatmapLayerRef.current}
                    >
                        <i className="fas fa-fire me-1"></i>
                        {isTransitioning ? 'Procesando...' :
                            !heatmapLayerRef.current ? 'Mapa de Calor N/A' :
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

            {/* Mapa */}
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

            {/* Estadísticas */}
            <div className="row mt-3">
                <div className="col-md-3">
                    <div className="card bg-light">
                        <div className="card-body text-center py-2">
                            <h6 className="card-title mb-1">{stats.total}</h6>
                            <small className="text-muted">Total Tickets</small>
                        </div>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card bg-light">
                        <div className="card-body text-center py-2">
                            <h6 className="card-title mb-1">{stats.enProceso}</h6>
                            <small className="text-muted">En Proceso</small>
                        </div>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card bg-light">
                        <div className="card-body text-center py-2">
                            <h6 className="card-title mb-1">{stats.solucionados}</h6>
                            <small className="text-muted">Solucionados</small>
                        </div>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card bg-light">
                        <div className="card-body text-center py-2">
                            <h6 className="card-title mb-1">{stats.cerrados}</h6>
                            <small className="text-muted">Cerrados</small>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sugerencias de navegación */}
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