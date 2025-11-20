import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function App() {
  const [dbStatus, setDbStatus] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')

  // Test database connection
  const testConnection = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/test`)
      setDbStatus(response.data)
    } catch (error) {
      setDbStatus({
        success: false,
        message: 'Failed to connect to backend',
        error: error.message
      })
    } finally {
      setLoading(false)
    }
  }

  // Fetch all test records
  const fetchRecords = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/test-records`)
      if (response.data.success) {
        setRecords(response.data.data)
      }
    } catch (error) {
      console.error('Error fetching records:', error)
    } finally {
      setLoading(false)
    }
  }

  // Create a new test record
  const createRecord = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return

    setLoading(true)
    try {
      const response = await axios.post(`${API_URL}/api/test-records`, {
        name: newName
      })
      if (response.data.success) {
        setNewName('')
        fetchRecords()
      }
    } catch (error) {
      console.error('Error creating record:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    testConnection()
    fetchRecords()
  }, [])

  return (
    <div className="app">
      <h1>React + Express + PostgreSQL Test</h1>
      
      <div className="section">
        <h2>Database Connection Status</h2>
        <button onClick={testConnection} disabled={loading}>
          {loading ? 'Testing...' : 'Test Connection'}
        </button>
        {dbStatus && (
          <div className={`status ${dbStatus.success ? 'success' : 'error'}`}>
            <p><strong>Status:</strong> {dbStatus.success ? '✅ Connected' : '❌ Failed'}</p>
            <p><strong>Message:</strong> {dbStatus.message}</p>
            {dbStatus.timestamp && (
              <p><strong>Timestamp:</strong> {new Date(dbStatus.timestamp).toLocaleString()}</p>
            )}
            {dbStatus.error && (
              <p><strong>Error:</strong> {dbStatus.error}</p>
            )}
          </div>
        )}
      </div>

      <div className="section">
        <h2>Test Records</h2>
        <button onClick={fetchRecords} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh Records'}
        </button>
        
        <form onSubmit={createRecord} className="form">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter a name"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !newName.trim()}>
            Add Record
          </button>
        </form>

        {records.length > 0 ? (
          <ul className="records-list">
            {records.map((record) => (
              <li key={record.id}>
                <strong>ID:</strong> {record.id} | <strong>Name:</strong> {record.name} | 
                <strong> Created:</strong> {new Date(record.created_at).toLocaleString()}
              </li>
            ))}
          </ul>
        ) : (
          <p>No records found. Create one above!</p>
        )}
      </div>
    </div>
  )
}

export default App
