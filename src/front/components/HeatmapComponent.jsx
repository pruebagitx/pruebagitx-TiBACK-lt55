import React, { useState, useEffect, useRef } from 'react';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import useGlobalReducer from '../hooks/useGlobalReducer';

const HeatmapComponent = () => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);
    const [heatmapData, setHeatmapData] = useState([]);
    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedMarker, setSelectedMarker] = useState(null);
    const [showMarkers, setShowMarkers] = useState(false);
    const [mapCenter, setMapCenter] = useState({ lat: 19.4326, lng: -99.1332 });
    const { isLoaded, error: googleMapsError } = useGoogleMaps();
    const { store } = useGlobalReducer();

    const fetchHeatmapData = async () => {
        try {
            setLoading(true);

            // Obtener token del store
            const token = store.auth.token;
            if (!token) {
                throw new Error('Token de autorización no encontrado');
            }

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/heatmap-data`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error ${response.status}: ${errorText}`);
            }

            const responseData = await response.json();

            // El backend devuelve { message, data, total_points }
            const data = responseData.data || [];

            // Validar que data es un array
            if (!Array.isArray(data)) {
                console.warn('Datos recibidos no son un array:', data);
                setRawData([]);
                setHeatmapData([]);
                setError('Formato de datos inválido');
                return;
            }

            setRawData(data);

            // Procesar datos para el heatmap con pesos dinámicos
            const processedData = data.map((item, index) => ({
                location: new window.google.maps.LatLng(item.lat, item.lng),
                weight: Math.max(1, Math.min(10, (index + 1) * 0.5)) // Peso dinámico basado en el índice
            }));

            setHeatmapData(processedData);
            setError(null);
        } catch (err) {
            console.error('Error fetching heatmap data:', err);
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

    const initializeMap = () => {
        if (!window.google || !window.google.maps || !mapRef.current) return;

        const map = new window.google.maps.Map(mapRef.current, {
            center: mapCenter,
            zoom: 10,
            mapTypeControl: true,
            streetViewControl: true,
            fullscreenControl: true,
            zoomControl: true
        });

        // Guardar referencia del mapa
        mapInstanceRef.current = map;

        // Crear marcadores de calor (alternativa al HeatmapLayer deprecado)
        if (heatmapData.length > 0) {
            heatmapData.forEach((point, index) => {
                // Crear marcador con tamaño basado en el peso
                const size = Math.max(8, Math.min(20, point.weight * 2));
                const opacity = Math.max(0.3, Math.min(0.9, point.weight / 10));

                const marker = new window.google.maps.Marker({
                    position: point.location,
                    map: map,
                    title: `Cliente ${index + 1}`,
                    icon: {
                        path: window.google.maps.SymbolPath.CIRCLE,
                        fillColor: '#ff0000',
                        fillOpacity: opacity,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                        scale: size
                    },
                    zIndex: 1000 + index
                });

                // Buscar el cliente correspondiente en rawData
                const clientData = rawData.find(client =>
                    Math.abs(client.lat - point.location.lat()) < 0.0001 &&
                    Math.abs(client.lng - point.location.lng()) < 0.0001
                );

                // Crear InfoWindow con información del cliente
                const infoWindow = new window.google.maps.InfoWindow({
                    content: `
                        <div style="padding: 12px; max-width: 300px; font-family: Arial, sans-serif;">
                            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                                <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #ff6b6b, #ff8e8e); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                                    <i class="fas fa-user" style="color: white; font-size: 16px;"></i>
                                </div>
                                <div>
                                    <h6 style="margin: 0; color: #333; font-weight: bold; font-size: 14px;">
                                        ${clientData ? `${clientData.nombre} ${clientData.apellido || ''}` : 'Cliente'}
                                    </h6>
                                    <p style="margin: 2px 0 0 0; color: #666; font-size: 12px;">
                                        <i class="fas fa-envelope" style="margin-right: 4px;"></i>
                                        ${clientData ? clientData.email : 'Email no disponible'}
                                    </p>
                                </div>
                            </div>
                            
                            <div style="border-top: 1px solid #eee; padding-top: 8px;">
                                <p style="margin: 4px 0; color: #555; font-size: 12px;">
                                    <i class="fas fa-map-marker-alt" style="color: #ff6b6b; margin-right: 6px;"></i>
                                    <strong>Dirección:</strong> ${clientData ? (clientData.direccion || 'No especificada') : 'No disponible'}
                                </p>
                                ${clientData && clientData.telefono ? `
                                    <p style="margin: 4px 0; color: #555; font-size: 12px;">
                                        <i class="fas fa-phone" style="color: #2196F3; margin-right: 6px;"></i>
                                        <strong>Teléfono:</strong> ${clientData.telefono}
                                    </p>
                                ` : ''}
                                <p style="margin: 4px 0; color: #555; font-size: 12px;">
                                    <i class="fas fa-map-pin" style="color: #4CAF50; margin-right: 6px;"></i>
                                    <strong>Coordenadas:</strong> ${point.location.lat().toFixed(6)}, ${point.location.lng().toFixed(6)}
                                </p>
                            </div>
                            
                            <div style="margin-top: 8px; padding: 6px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #ff6b6b;">
                                <p style="margin: 0; color: #666; font-size: 11px; font-style: italic;">
                                    <i class="fas fa-info-circle" style="margin-right: 4px;"></i>
                                    Haz clic para ver más detalles y opciones de navegación
                                </p>
                            </div>
                        </div>
                    `
                });

                // Mostrar InfoWindow al hacer hover solo si los marcadores están habilitados
                marker.addListener('mouseover', () => {
                    if (showMarkers) {
                        infoWindow.open(map, marker);
                    }
                });

                // Ocultar InfoWindow al salir del hover
                marker.addListener('mouseout', () => {
                    infoWindow.close();
                });
            });
        }

        // Limpiar marcadores existentes
        markersRef.current.forEach(marker => {
            marker.setMap(null);
        });
        markersRef.current = [];

        // Crear marcadores si están habilitados
        if (showMarkers && rawData.length > 0) {
            rawData.forEach((item, index) => {
                const marker = new window.google.maps.Marker({
                    position: { lat: item.lat, lng: item.lng },
                    map: map,
                    title: `${item.nombre} - ${item.email}`,
                    icon: {
                        path: window.google.maps.SymbolPath.CIRCLE,
                        fillColor: '#ff0000',
                        fillOpacity: 0.8,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                        scale: 8
                    }
                });

                // Crear InfoWindow con información completa del cliente
                const infoWindow = new window.google.maps.InfoWindow({
                    content: `
                        <div style="padding: 12px; max-width: 300px; font-family: Arial, sans-serif;">
                            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                                <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #ff6b6b, #ff8e8e); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                                    <i class="fas fa-user" style="color: white; font-size: 16px;"></i>
                                </div>
                                <div>
                                    <h6 style="margin: 0; color: #333; font-weight: bold; font-size: 14px;">
                                        ${item.nombre} ${item.apellido || ''}
                                    </h6>
                                    <p style="margin: 2px 0 0 0; color: #666; font-size: 12px;">
                                        <i class="fas fa-envelope" style="margin-right: 4px;"></i>
                                        ${item.email}
                                    </p>
                                </div>
                            </div>
                            
                            <div style="border-top: 1px solid #eee; padding-top: 8px;">
                                <p style="margin: 4px 0; color: #555; font-size: 12px;">
                                    <i class="fas fa-map-marker-alt" style="color: #ff6b6b; margin-right: 6px;"></i>
                                    <strong>Dirección:</strong> ${item.direccion || 'No especificada'}
                                </p>
                                <p style="margin: 4px 0; color: #555; font-size: 12px;">
                                    <i class="fas fa-map-pin" style="color: #4CAF50; margin-right: 6px;"></i>
                                    <strong>Coordenadas:</strong> ${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}
                                </p>
                                ${item.telefono ? `
                                    <p style="margin: 4px 0; color: #555; font-size: 12px;">
                                        <i class="fas fa-phone" style="color: #2196F3; margin-right: 6px;"></i>
                                        <strong>Teléfono:</strong> ${item.telefono}
                                    </p>
                                ` : ''}
                            </div>
                            
                            <div style="margin-top: 8px; padding: 6px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #ff6b6b;">
                                <p style="margin: 0; color: #666; font-size: 11px; font-style: italic;">
                                    <i class="fas fa-info-circle" style="margin-right: 4px;"></i>
                                    Haz clic para ver más detalles y opciones de navegación
                                </p>
                            </div>
                        </div>
                    `
                });

                // Mostrar InfoWindow al hacer hover solo si los marcadores están habilitados
                marker.addListener('mouseover', () => {
                    if (showMarkers) {
                        infoWindow.open(map, marker);
                    }
                });

                // Ocultar InfoWindow al salir del hover
                marker.addListener('mouseout', () => {
                    infoWindow.close();
                });

                marker.addListener('click', () => {
                    setSelectedMarker({
                        id: index,
                        data: item,
                        marker: marker
                    });
                });

                // Guardar referencia del marcador
                markersRef.current.push(marker);
            });
        }
    };

    useEffect(() => {
        if (isLoaded && !googleMapsError && heatmapData.length > 0) {
            initializeMap();
        }
    }, [isLoaded, googleMapsError, heatmapData, showMarkers]);

    const goToLocation = (lat, lng) => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.setCenter({ lat, lng });
            mapInstanceRef.current.setZoom(15);
        }
    };

    const centerOnAllPoints = () => {
        if (rawData.length === 0 || !mapInstanceRef.current) return;

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
        });
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
            <div className="alert alert-danger" role="alert">
                <i className="fas fa-exclamation-triangle me-2"></i>
                Error al cargar el mapa de calor: {error}
            </div>
        );
    }

    return (
        <div className="heatmap-container">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">
                    <i className="fas fa-map-marker-alt me-2 text-danger"></i>
                    Mapa de Distribución de Clientes
                </h5>
                <div className="btn-group" role="group">
                    <button
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => setShowMarkers(!showMarkers)}
                    >
                        <i className="fas fa-map-marker-alt me-1"></i>
                        {showMarkers ? 'Ocultar' : 'Mostrar'} Marcadores
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-success btn-sm"
                        onClick={centerOnAllPoints}
                    >
                        <i className="fas fa-expand-arrows-alt me-1"></i>
                        Ver Todos
                    </button>
                </div>
            </div>

            <div className="map-container" style={{ height: '500px', width: '100%', position: 'relative' }}>
                <div
                    ref={mapRef}
                    style={{ height: '100%', width: '100%', borderRadius: '8px' }}
                />
            </div>

            {selectedMarker && (
                <div className="mt-3">
                    <div className="card">
                        <div className="card-header">
                            <h6 className="mb-0">
                                <i className="fas fa-user me-2"></i>
                                Información del Cliente
                            </h6>
                        </div>
                        <div className="card-body">
                            <p><strong>Nombre:</strong> {selectedMarker.data.nombre} {selectedMarker.data.apellido}</p>
                            <p><strong>Email:</strong> {selectedMarker.data.email}</p>
                            <p><strong>Dirección:</strong> {selectedMarker.data.direccion}</p>
                            <p><strong>Coordenadas:</strong> {selectedMarker.data.lat.toFixed(6)}, {selectedMarker.data.lng.toFixed(6)}</p>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => goToLocation(selectedMarker.data.lat, selectedMarker.data.lng)}
                            >
                                <i className="fas fa-crosshairs me-1"></i>
                                Acercar
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                        <h6 className="card-title small mb-1">{item.nombre} {item.apellido}</h6>
                                        <p className="card-text small text-muted mb-1">{item.email}</p>
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