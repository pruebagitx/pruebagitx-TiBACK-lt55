import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useGlobalReducer from '../hooks/useGlobalReducer';
import { ClienteSidebar } from '../components/ClienteSidebar';

const IdentificarImagen = () => {
    const { ticketId } = useParams();
    const navigate = useNavigate();
    const { store, dispatch } = useGlobalReducer();
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(false);
    const [image, setImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [additionalDetails, setAdditionalDetails] = useState('');
    const [analysisResult, setAnalysisResult] = useState(null);
    const [error, setError] = useState(null);
    const [sidebarHidden, setSidebarHidden] = useState(false);
    const [activeView, setActiveView] = useState('identificar-imagen');

    useEffect(() => {
        // Cargar información del ticket
        const fetchTicket = async () => {
            try {
                const token = localStorage.getItem('cliente') || localStorage.getItem('analista') ||
                    localStorage.getItem('supervisor') || localStorage.getItem('administrador');

                if (!token) {
                    navigate('/auth');
                    return;
                }

                const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/tickets/${ticketId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const ticketData = await response.json();
                    setTicket(ticketData);
                } else {
                    setError('Error al cargar el ticket');
                }
            } catch (err) {
                setError('Error de conexión');
            }
        };

        fetchTicket();
    }, [ticketId, navigate]);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImage(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                setImagePreview(e.target.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAnalyze = async () => {
        if (!image) {
            setError('Por favor selecciona una imagen');
            return;
        }

        if (!additionalDetails.trim()) {
            setError('Por favor proporciona detalles adicionales sobre el problema');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem('cliente') || localStorage.getItem('analista') ||
                localStorage.getItem('supervisor') || localStorage.getItem('administrador');

            const formData = new FormData();
            formData.append('image', image);
            formData.append('ticket_id', ticketId);
            formData.append('use_ticket_context', true); // Siempre usar contexto del ticket

            // Siempre incluir título y descripción del ticket
            if (ticket) {
                formData.append('ticket_title', ticket.titulo);
                formData.append('ticket_description', ticket.descripcion);
            }

            // Siempre incluir detalles adicionales
            formData.append('additional_details', additionalDetails);

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/analyze-image`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                setAnalysisResult(result);
            } else {
                setError(result.message || 'Error al analizar la imagen');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveToTicket = async () => {
        if (!analysisResult) return;

        try {
            const token = localStorage.getItem('cliente') || localStorage.getItem('analista') ||
                localStorage.getItem('supervisor') || localStorage.getItem('administrador');

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/comentarios`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id_ticket: parseInt(ticketId),
                    texto: `🤖 ANÁLISIS DE IMAGEN CON IA:\n\n${analysisResult.analysis}`
                })
            });

            if (response.ok) {
                alert('Análisis guardado en el ticket');
                navigate(`/ticket/${ticketId}/comentarios`);
            } else {
                setError('Error al guardar el análisis');
            }
        } catch (err) {
            setError('Error al guardar el análisis');
        }
    };

    // Función para alternar sidebar
    const toggleSidebar = () => {
        setSidebarHidden(!sidebarHidden);
    };

    // Función para cambiar vista
    const changeView = (view) => {
        setActiveView(view);
        if (view === 'dashboard') {
            navigate('/cliente');
        } else if (view === 'tickets') {
            navigate('/cliente');
        } else if (view === 'create') {
            navigate('/cliente');
        }
    };

    if (!ticket) {
        return (
            <div className="hyper-layout d-flex">
                <ClienteSidebar
                    sidebarHidden={sidebarHidden}
                    activeView={activeView}
                    changeView={changeView}
                />
                <div className={`hyper-main-content flex-grow-1 ${sidebarHidden ? 'sidebar-hidden' : ''}`}>
                    <div className="d-flex justify-content-center align-items-center vh-100">
                        <div className="spinner-border" role="status">
                            <span className="visually-hidden">Cargando...</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="hyper-layout d-flex">
            {/* Sidebar izquierdo */}
            <ClienteSidebar
                sidebarHidden={sidebarHidden}
                activeView={activeView}
                changeView={changeView}
            />

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
                            <div>
                                <h1 className="mb-0 fw-semibold">
                                    <i className="fas fa-robot me-2"></i>
                                    Análisis de Imagen con IA
                                </h1>
                                <small className="text-muted">Ticket: {ticket.titulo}</small>
                            </div>
                        </div>
                        <div className="d-flex align-items-center gap-3">
                            <button
                                className="btn btn-outline-secondary"
                                onClick={() => navigate(`/ticket/${ticketId}/recomendaciones-ia`)}
                            >
                                <i className="fas fa-arrow-left me-2"></i>
                                Volver a Recomendaciones
                            </button>
                        </div>
                    </div>
                </header>

                {/* Contenido del dashboard */}
                <div className="p-4">
                    <div className="row">
                        <div className="col-md-8 mx-auto">
                            <div className="card">
                                <div className="card-header">
                                    <h4 className="mb-0">
                                        <i className="fas fa-robot me-2"></i>
                                        Análisis de Imagen con IA
                                    </h4>
                                    <small className="text-muted">Ticket: {ticket.titulo}</small>
                                </div>
                                <div className="card-body">
                                    {error && (
                                        <div className="alert alert-danger" role="alert">
                                            {error}
                                        </div>
                                    )}

                                    {/* Configuración de contexto */}
                                    <div className="mb-4">
                                        <h5>Configuración del Análisis</h5>
                                        <div className="alert alert-info">
                                            <i className="fas fa-info-circle me-2"></i>
                                            <strong>Contexto del Ticket:</strong> Se utilizará automáticamente el título y descripción del ticket como referencia para el análisis.
                                        </div>
                                    </div>

                                    {/* Detalles adicionales - OBLIGATORIO */}
                                    <div className="mb-4">
                                        <label htmlFor="additionalDetails" className="form-label">
                                            <strong>Proporcionar detalles adicionales *</strong>
                                        </label>
                                        <textarea
                                            className="form-control"
                                            id="additionalDetails"
                                            rows="4"
                                            value={additionalDetails}
                                            onChange={(e) => setAdditionalDetails(e.target.value)}
                                            placeholder="Describe el problema que estás experimentando y qué esperas que la IA identifique en la imagen..."
                                            required
                                        />
                                        <div className="form-text">
                                            <i className="fas fa-lightbulb me-1"></i>
                                            Esta información junto con la imagen y el contexto del ticket forman el soporte para obtener buenas respuestas y solucionar el problema al cliente.
                                        </div>
                                    </div>

                                    {/* Carga de imagen */}
                                    <div className="mb-4">
                                        <label htmlFor="imageUpload" className="form-label">
                                            Seleccionar imagen del problema:
                                        </label>
                                        <input
                                            type="file"
                                            className="form-control"
                                            id="imageUpload"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                        />
                                        {imagePreview && (
                                            <div className="mt-3">
                                                <img
                                                    src={imagePreview}
                                                    alt="Preview"
                                                    className="img-fluid"
                                                    style={{ maxHeight: '300px' }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Botón de análisis */}
                                    <div className="mb-4">
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleAnalyze}
                                            disabled={loading || !image || !additionalDetails.trim()}
                                        >
                                            {loading ? (
                                                <>
                                                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                                                    Analizando...
                                                </>
                                            ) : (
                                                <>
                                                    <i className="fas fa-robot me-2"></i>
                                                    Analizar Imagen
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {/* Resultados del análisis */}
                                    {analysisResult && (
                                        <div className="mt-4">
                                            <h5>Resultado del Análisis</h5>
                                            <div className="card">
                                                <div className="card-body">
                                                    <h6>Análisis General:</h6>
                                                    <p className="mb-3">{analysisResult.analysis}</p>

                                                    {analysisResult.labels && analysisResult.labels.length > 0 && (
                                                        <div className="mb-3">
                                                            <h6>Elementos Detectados:</h6>
                                                            <div className="d-flex flex-wrap gap-2">
                                                                {analysisResult.labels.map((label, index) => (
                                                                    <span key={index} className="badge bg-primary">
                                                                        {label.description} ({Math.round(label.score * 100)}%)
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {analysisResult.text && analysisResult.text.length > 0 && (
                                                        <div className="mb-3">
                                                            <h6>Texto Detectado:</h6>
                                                            <div className="alert alert-info">
                                                                {analysisResult.text.map((textItem, index) => (
                                                                    <div key={index} className="mb-1">
                                                                        <strong>{textItem.description}</strong>
                                                                        {textItem.locale && (
                                                                            <small className="text-muted ms-2">({textItem.locale})</small>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {analysisResult.objects && analysisResult.objects.length > 0 && (
                                                        <div className="mb-3">
                                                            <h6>Objetos Localizados:</h6>
                                                            <div className="row">
                                                                {analysisResult.objects.map((obj, index) => (
                                                                    <div key={index} className="col-md-6 mb-2">
                                                                        <div className="card">
                                                                            <div className="card-body p-2">
                                                                                <strong>{obj.name}</strong>
                                                                                <br />
                                                                                <small className="text-muted">
                                                                                    Confianza: {Math.round(obj.score * 100)}%
                                                                                </small>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="mt-3">
                                                        <button
                                                            className="btn btn-success"
                                                            onClick={handleSaveToTicket}
                                                        >
                                                            <i className="fas fa-save me-2"></i>
                                                            Guardar Análisis en el Ticket
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Botón de regreso */}
                                    <div className="mt-4">
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => navigate(`/ticket/${ticketId}/recomendaciones-ia`)}
                                        >
                                            <i className="fas fa-arrow-left me-2"></i>
                                            Volver a Recomendaciones
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IdentificarImagen;
