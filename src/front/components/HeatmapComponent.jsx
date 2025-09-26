import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, HeatmapLayer, Marker, InfoWindow } from '@react-google-maps/api';

// Mover libraries fuera del componente para evitar recreación
const libraries = ['visualization'];

// Suprimir warnings específicos de Google Maps API
const suppressGoogleMapsWarnings = () => {
    const originalConsoleWarn = console.warn;
    console.warn = (...args) => {
        const message = args.join(' ');
        // Suprimir warnings específicos de Google Maps
        if (
            message.includes('google.maps.places.Autocomplete is not available to new customers') ||
            message.includes('google.maps.Marker is deprecated') ||
            message.includes('Please use google.maps.marker.AdvancedMarkerElement') ||
            message.includes('Please use google.maps.places.PlaceAutocompleteElement')
        ) {
            return; // No mostrar estos warnings
        }
        originalConsoleWarn.apply(console, args);
    };
};

const HeatmapComponent = () => {
    const [heatmapData, setHeatmapData] = useState([]);
    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedMarker, setSelectedMarker] = useState(null);
    const [showMarkers, setShowMarkers] = useState(true);
    const [mapCenter, setMapCenter] = useState({
        lat: 4.6097, // Bogotá, Colombia como centro por defecto
        lng: -74.0817
    });
    const mapRef = useRef(null);

    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
        libraries: libraries
    });

    // Activar supresión de warnings al cargar el componente
    useEffect(() => {
        suppressGoogleMapsWarnings();
    }, []);

    // Configuración del mapa
    const mapContainerStyle = {
        width: '100%',
        height: '600px'
    };

    const options = {
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: true,
        fullscreenControl: true,
        styles: [
            {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
            }
        ]
    };

    // Función para navegar a un punto específico
    const goToLocation = useCallback((lat, lng, zoom = 15) => {
        if (mapRef.current) {
            mapRef.current.panTo({ lat, lng });
            mapRef.current.setZoom(zoom);
        }
    }, []);

    // Función para centrar en todos los puntos
    const centerOnAllPoints = useCallback(() => {
        if (rawData.length > 0 && mapRef.current) {
            const bounds = new window.google.maps.LatLngBounds();
            rawData.forEach(point => {
                bounds.extend(new window.google.maps.LatLng(point.lat, point.lng));
            });
            mapRef.current.fitBounds(bounds);
        }
    }, [rawData]);

    // Función para obtener datos del mapa de calor
    const fetchHeatmapData = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('administrador');

            if (!token) {
                throw new Error('No hay token de autenticación');
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
                console.error('Error del servidor:', errorText);
                throw new Error(`Error ${response.status}: ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();

            if (result.data && result.data.length > 0) {
                // Guardar datos raw para marcadores
                setRawData(result.data);

                // Convertir datos para HeatmapLayer con pesos dinámicos
                const heatmapPoints = result.data.map((point, index) => ({
                    location: new window.google.maps.LatLng(point.lat, point.lng),
                    weight: Math.max(0.5, Math.min(2.0, 1 + (index % 3) * 0.3)) // Peso variable para mejor visualización
                }));
                setHeatmapData(heatmapPoints);

                // Calcular centro del mapa basado en los datos
                if (result.data.length > 0) {
                    const avgLat = result.data.reduce((sum, point) => sum + point.lat, 0) / result.data.length;
                    const avgLng = result.data.reduce((sum, point) => sum + point.lng, 0) / result.data.length;
                    setMapCenter({ lat: avgLat, lng: avgLng });
                }
            } else {
                setRawData([]);
                setHeatmapData([]);
            }
        } catch (err) {
            console.error('Error al obtener datos del mapa de calor:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isLoaded) {
            fetchHeatmapData();
        }
    }, [isLoaded, fetchHeatmapData]);

    const onLoad = useCallback((map) => {
        mapRef.current = map;
        console.log('Mapa cargado');
    }, []);

    const onUnmount = useCallback((map) => {
        mapRef.current = null;
        console.log('Mapa desmontado');
    }, []);

    if (!isLoaded) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ height: '500px' }}>
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Cargando mapa...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="card">
            <div className="card-header">
                <h5 className="mb-0">
                    <i className="fas fa-fire me-2"></i>
                    Mapa de Calor - Distribución de Clientes
                </h5>
            </div>
            <div className="card-body">
                {loading && (
                    <div className="d-flex justify-content-center align-items-center" style={{ height: '200px' }}>
                        <div className="spinner-border text-primary" role="status">
                            <span className="visually-hidden">Cargando datos...</span>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="alert alert-danger" role="alert">
                        <i className="fas fa-exclamation-triangle me-2"></i>
                        Error al cargar el mapa de calor: {error}
                    </div>
                )}

                {!loading && !error && (
                    <>
                        <div className="mb-3 d-flex justify-content-between align-items-center">
                            <div>
                                <small className="text-muted">
                                    <i className="fas fa-info-circle me-1"></i>
                                    Puntos de calor: {heatmapData.length} ubicaciones de clientes
                                </small>
                            </div>
                            <div className="btn-group" role="group">
                                <button
                                    className={`btn btn-sm ${showMarkers ? 'btn-primary' : 'btn-outline-primary'}`}
                                    onClick={() => setShowMarkers(!showMarkers)}
                                >
                                    <i className="fas fa-map-marker-alt me-1"></i>
                                    {showMarkers ? 'Ocultar' : 'Mostrar'} Marcadores
                                </button>
                                <button
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={centerOnAllPoints}
                                >
                                    <i className="fas fa-expand-arrows-alt me-1"></i>
                                    Ver Todos
                                </button>
                            </div>
                        </div>

                        <GoogleMap
                            mapContainerStyle={mapContainerStyle}
                            center={mapCenter}
                            zoom={rawData.length > 0 ? 12 : 10}
                            onLoad={onLoad}
                            onUnmount={onUnmount}
                            options={options}
                        >
                            {heatmapData.length > 0 && (
                                <HeatmapLayer
                                    data={heatmapData}
                                    options={{
                                        radius: 30,
                                        opacity: 0.7,
                                        maxIntensity: 2,
                                        gradient: [
                                            'rgba(0, 255, 255, 0)',
                                            'rgba(0, 255, 255, 1)',
                                            'rgba(0, 191, 255, 1)',
                                            'rgba(0, 127, 255, 1)',
                                            'rgba(0, 63, 255, 1)',
                                            'rgba(0, 0, 255, 1)',
                                            'rgba(0, 0, 223, 1)',
                                            'rgba(0, 0, 191, 1)',
                                            'rgba(0, 0, 159, 1)',
                                            'rgba(0, 0, 127, 1)',
                                            'rgba(63, 0, 127, 1)',
                                            'rgba(127, 0, 127, 1)',
                                            'rgba(191, 0, 127, 1)',
                                            'rgba(255, 0, 127, 1)',
                                            'rgba(255, 0, 63, 1)',
                                            'rgba(255, 0, 0, 1)'
                                        ]
                                    }}
                                />
                            )}

                            {showMarkers && rawData.map((point, index) => (
                                <Marker
                                    key={point.id || index}
                                    position={{ lat: point.lat, lng: point.lng }}
                                    onClick={() => setSelectedMarker(point)}
                                    icon={{
                                        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                                            <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                                                <circle cx="16" cy="16" r="12" fill="#ff6b6b" stroke="#fff" stroke-width="3"/>
                                                <text x="16" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${index + 1}</text>
                                            </svg>
                                        `),
                                        scaledSize: new window.google.maps.Size(32, 32),
                                        anchor: new window.google.maps.Point(16, 16)
                                    }}
                                />
                            ))}

                            {selectedMarker && (
                                <InfoWindow
                                    position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
                                    onCloseClick={() => setSelectedMarker(null)}
                                >
                                    <div style={{ padding: '10px', minWidth: '200px' }}>
                                        <h6 className="mb-2">
                                            <i className="fas fa-user me-1"></i>
                                            {selectedMarker.nombre}
                                        </h6>
                                        <p className="mb-1">
                                            <i className="fas fa-envelope me-1"></i>
                                            {selectedMarker.email}
                                        </p>
                                        <p className="mb-2">
                                            <i className="fas fa-map-marker-alt me-1"></i>
                                            {selectedMarker.direccion}
                                        </p>
                                        <div className="d-flex gap-2">
                                            <button
                                                className="btn btn-sm btn-primary"
                                                onClick={() => {
                                                    goToLocation(selectedMarker.lat, selectedMarker.lng, 18);
                                                    setSelectedMarker(null);
                                                }}
                                            >
                                                <i className="fas fa-search-plus me-1"></i>
                                                Acercar
                                            </button>
                                            <button
                                                className="btn btn-sm btn-outline-secondary"
                                                onClick={() => setSelectedMarker(null)}
                                            >
                                                Cerrar
                                            </button>
                                        </div>
                                    </div>
                                </InfoWindow>
                            )}
                        </GoogleMap>

                        {rawData.length > 0 && (
                            <div className="mt-4">
                                <h6 className="mb-3">
                                    <i className="fas fa-lightbulb me-2"></i>
                                    Sugerencias de Navegación
                                </h6>
                                <div className="row">
                                    {rawData.slice(0, 6).map((point, index) => (
                                        <div key={point.id || index} className="col-md-4 col-lg-2 mb-2">
                                            <div
                                                className="card h-100 cursor-pointer"
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => goToLocation(point.lat, point.lng, 16)}
                                            >
                                                <div className="card-body p-2 text-center">
                                                    <div className="mb-1">
                                                        <i className="fas fa-map-marker-alt text-danger"></i>
                                                    </div>
                                                    <h6 className="card-title small mb-1" style={{ fontSize: '0.8rem' }}>
                                                        {point.nombre.length > 15 ? point.nombre.substring(0, 15) + '...' : point.nombre}
                                                    </h6>
                                                    <p className="card-text small text-muted mb-0" style={{ fontSize: '0.7rem' }}>
                                                        {point.direccion.length > 20 ? point.direccion.substring(0, 20) + '...' : point.direccion}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {rawData.length > 6 && (
                                    <div className="text-center mt-2">
                                        <small className="text-muted">
                                            Y {rawData.length - 6} ubicaciones más...
                                        </small>
                                    </div>
                                )}
                            </div>
                        )}

                        {heatmapData.length === 0 && !loading && (
                            <div className="text-center py-5">
                                <i className="fas fa-map-marked-alt fa-3x text-muted mb-3"></i>
                                <h6 className="text-muted">No hay datos de ubicación disponibles</h6>
                                <p className="text-muted">
                                    Los clientes no tienen coordenadas geográficas registradas.
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default HeatmapComponent;
