'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [pendingRequest, setPendingRequest] = useState<Record<string, unknown> | null>(null)
  const [name, setName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)
      setName(p?.full_name ?? '')

      const { data: req } = await supabase
        .from('profile_change_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (req && (req.status === 'pending' || req.status === 'rejected')) setPendingRequest(req)
    }
    load()
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    if (name === profile.full_name && !avatarFile && !removeAvatar) {
      setMessage({ text: 'No changes to submit.', ok: false })
      return
    }
    setSubmitting(true)

    // 'REMOVE' is a sentinel value meaning clear the avatar
    let avatarUrl: string | null = removeAvatar ? 'REMOVE' : null
    if (!removeAvatar && avatarFile) {
      const ext = avatarFile.name.split('.').pop()
      const path = `${profile.id}-${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true })
      if (uploadErr) {
        setMessage({ text: 'Image upload failed: ' + uploadErr.message, ok: false })
        setSubmitting(false)
        return
      }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      avatarUrl = urlData.publicUrl
    }

    const { error } = await supabase.from('profile_change_requests').insert({
      user_id: profile.id,
      requested_name: name !== profile.full_name ? name : null,
      requested_avatar_url: avatarUrl,
      status: 'pending',
    })

    if (error) {
      setMessage({ text: 'Failed to submit: ' + error.message, ok: false })
    } else {
      setMessage({ text: 'Request submitted! Your manager will review the changes.', ok: true })
      const { data: req } = await supabase
        .from('profile_change_requests')
        .select('*')
        .eq('user_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (req) setPendingRequest(req)
      setAvatarFile(null)
      setAvatarPreview(null)
    }
    setSubmitting(false)
  }

  const initials = profile?.full_name?.[0]?.toUpperCase() ?? '?'

  return (
    <AppShell>
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">My Profile</h1>
        <p className="text-gray-500 mb-8">Changes require manager approval before taking effect</p>

        {pendingRequest && (pendingRequest.status as string) === 'pending' && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-lg">⏳</span>
            <div>
              <p className="font-medium text-yellow-800 text-sm">Change request pending approval</p>
              <p className="text-yellow-700 text-xs mt-0.5">
                {(pendingRequest.requested_name as string | null) && <>Name: <strong>{pendingRequest.requested_name as string}</strong></>}
                {(pendingRequest.requested_name as string | null) && (pendingRequest.requested_avatar_url as string | null) && ' · '}
                {(pendingRequest.requested_avatar_url as string | null) && 'New profile picture uploaded'}
              </p>
            </div>
          </div>
        )}
        {pendingRequest && (pendingRequest.status as string) === 'rejected' && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-lg">❌</span>
            <div className="flex-1">
              <p className="font-medium text-red-800 text-sm">Your change request was rejected</p>
              {(pendingRequest.rejection_reason as string | null) && (
                <p className="text-red-700 text-xs mt-1">Reason: <strong>{pendingRequest.rejection_reason as string}</strong></p>
              )}
              <p className="text-red-600 text-xs mt-1">You may submit a new request below.</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          {/* Current avatar */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : initials}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{profile?.full_name}</p>
              <p className="text-sm text-gray-500 capitalize">{profile?.role?.replace(/_/g, ' ')}</p>
              <p className="text-sm text-gray-400">{profile?.email}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Profile Picture</label>
              <input
                type="file"
                accept="image/*"
                disabled={removeAvatar}
                onChange={handleFileChange}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 disabled:opacity-40"
              />
              {avatarPreview && !removeAvatar && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Preview:</p>
                  <img src={avatarPreview} alt="preview" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                </div>
              )}
              {profile?.avatar_url && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={removeAvatar}
                    onChange={e => { setRemoveAvatar(e.target.checked); if (e.target.checked) { setAvatarFile(null); setAvatarPreview(null) } }}
                    className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-400"
                  />
                  <span className="text-sm text-red-600">Remove current profile picture</span>
                </label>
              )}
            </div>

            {message && (
              <div className={`px-4 py-3 rounded-lg text-sm ${message.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || (!!pendingRequest && (pendingRequest.status as string) === 'pending')}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : (pendingRequest && (pendingRequest.status as string) === 'pending') ? 'Request Pending Approval' : 'Submit for Approval'}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  )
}
