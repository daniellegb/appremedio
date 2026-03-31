import { supabase } from './lib/supabase';

export const diagnosticService = {
  async checkNotificationSystem() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'User not authenticated' };

    const results: any = {};

    // 1. Check Subscriptions
    const { data: subs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user.id);
    
    results.subscriptions = {
      count: subs?.length || 0,
      data: subs,
      error: subsError
    };

    // 2. Check Pending Jobs
    const { data: pendingJobs, error: jobsError } = await supabase
      .from('notification_jobs')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('trigger_at', { ascending: true });

    results.pendingJobs = {
      count: pendingJobs?.length || 0,
      nextJob: pendingJobs?.[0],
      error: jobsError
    };

    // 3. Check Recently Processed Jobs
    const { data: recentJobs } = await supabase
      .from('notification_jobs')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'pending')
      .order('processed_at', { ascending: false })
      .limit(5);

    results.recentJobs = recentJobs;

    // 4. Check Medications next_dose_at
    const { data: meds } = await supabase
      .from('medications')
      .select('id, name, next_dose_at')
      .eq('user_id', user.id);
    
    results.medications = meds;

    // 5. Check Server Time vs Local Time
    const { data: serverTime } = await supabase.rpc('get_server_time');
    results.times = {
      server: serverTime,
      local: new Date().toISOString()
    };

    return results;
  }
};
