-- Optimize existing BOQ reads; preserve response fields, financial rules and role boundaries.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_project_boq(p_project_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE project public.projects%ROWTYPE; result jsonb; role_value text:=public.cf_current_role();
BEGIN
 IF auth.uid() IS NULL OR coalesce(role_value,'') NOT IN ('super_admin','pm','client','site_manager') OR NOT coalesce(public.cf_project_access(p_project_id),false) THEN RAISE EXCEPTION 'Project BOQ access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO project FROM public.projects WHERE id=p_project_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE='P0002'; END IF;
 IF role_value='site_manager' THEN
 RETURN jsonb_build_object('revision',project.boq_revision,'project_name',project.name,'materials',
 (WITH orders AS MATERIALIZED (
 SELECT boq_item_id,coalesce(sum(quantity_ordered) FILTER (WHERE status NOT IN ('Cancelled','Rejected')),0) ordered_quantity,
 coalesce(sum(quantity_received),0) received_quantity FROM public.purchase_orders
 WHERE project_id=p_project_id AND boq_item_id IS NOT NULL GROUP BY boq_item_id)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.description,'unit',b.unit,'allocated_quantity',b.quantity,'active',b.active,
 'ordered_quantity',coalesce(o.ordered_quantity,0),'received_quantity',coalesce(o.received_quantity,0))),'[]'::jsonb)
 FROM public.project_boq_lines b LEFT JOIN orders o ON o.boq_item_id=b.id
 WHERE b.project_id=p_project_id AND b.kind='material' AND b.active));
 END IF;
 SELECT jsonb_build_object('project_name',project.name,'revision',project.boq_revision,'boq_data',project.boq_data,'project_budget',project.total_budget,
 'requires_reupload',CASE WHEN jsonb_typeof(project.boq_data->'items_count')='number' THEN (project.boq_data->>'items_count')::numeric>jsonb_array_length(coalesce(project.boq_data->'items','[]'::jsonb)) ELSE false END,
 'lines',coalesce((WITH
 orders AS MATERIALIZED (
 SELECT boq_item_id,
 coalesce(sum(quantity_ordered) FILTER (WHERE status NOT IN ('Cancelled','Rejected')),0) ordered_quantity,
 coalesce(sum(quantity_received),0) received_quantity,
 coalesce(sum(CASE WHEN status='Received' THEN total_price WHEN status='Delivered' AND quantity_ordered>0
 THEN total_price*least(1,quantity_received/quantity_ordered) ELSE 0 END),0) actual_cost
 FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id IS NOT NULL GROUP BY boq_item_id),
 expenses AS MATERIALIZED (
 SELECT boq_item_id,coalesce(sum(quantity_used),0) used_quantity,coalesce(sum(amount),0) actual_cost
 FROM public.project_expenses WHERE project_id=p_project_id AND boq_item_id IS NOT NULL GROUP BY boq_item_id),
 salaries AS MATERIALIZED (
 SELECT boq_item_id,coalesce(sum(coalesce(total_amount,total_pay,0)),0) actual_cost
 FROM public.salary_slips WHERE project_id=p_project_id AND status='Paid' AND boq_item_id IS NOT NULL GROUP BY boq_item_id),
 payments AS MATERIALIZED (
 SELECT boq_item_id,coalesce(sum(amount),0) payment_scheduled FROM public.client_payment_schedule
 WHERE project_id=p_project_id AND boq_item_id IS NOT NULL GROUP BY boq_item_id),
 variations AS MATERIALIZED (
 SELECT boq_item_id,coalesce(sum(amount),0) approved_variations FROM public.variation_orders
 WHERE project_id=p_project_id AND status='Approved' AND boq_item_id IS NOT NULL GROUP BY boq_item_id)
 SELECT jsonb_agg(to_jsonb(b)||jsonb_build_object(
 'ordered_quantity',coalesce(o.ordered_quantity,0),'received_quantity',coalesce(o.received_quantity,0),
 'used_quantity',coalesce(e.used_quantity,0),'actual_cost',coalesce(o.actual_cost,0)+coalesce(e.actual_cost,0)+coalesce(s.actual_cost,0),
 'payment_scheduled',coalesce(p.payment_scheduled,0),'approved_variations',coalesce(v.approved_variations,0)))
 FROM public.project_boq_lines b LEFT JOIN orders o ON o.boq_item_id=b.id LEFT JOIN expenses e ON e.boq_item_id=b.id
 LEFT JOIN salaries s ON s.boq_item_id=b.id LEFT JOIN payments p ON p.boq_item_id=b.id LEFT JOIN variations v ON v.boq_item_id=b.id
 WHERE b.project_id=p_project_id),'[]'::jsonb),
 'unallocated_orders',(SELECT count(*) FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id IS NULL),
 'unallocated_expenses',(SELECT count(*) FROM public.project_expenses WHERE project_id=p_project_id AND boq_item_id IS NULL),
 'payroll_paid',(SELECT coalesce(sum(coalesce(total_amount,total_pay,0)),0) FROM public.salary_slips WHERE project_id=p_project_id AND status='Paid')
 ) INTO result;
 IF role_value='client' THEN
 result:=jsonb_set(result,'{boq_data}',coalesce(project.boq_data,'{}'::jsonb)-'labour_overrides'-'labour_rates');
 result:=jsonb_set(result,'{lines}',coalesce((SELECT jsonb_agg(value) FROM jsonb_array_elements(result->'lines') WHERE value->>'kind'<>'labour'),'[]'::jsonb));
 END IF;
 IF role_value IN ('super_admin','pm') THEN
 result:=result||jsonb_build_object('unallocated_records',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
 SELECT 'purchase_orders' AS table_name,id,coalesce(po_number,'Purchase order') AS label FROM public.purchase_orders WHERE project_id=p_project_id AND boq_item_id IS NULL
 UNION ALL SELECT 'project_expenses',id,title FROM public.project_expenses WHERE project_id=p_project_id AND boq_item_id IS NULL
 UNION ALL SELECT 'material_requests',id,item_name FROM public.material_requests WHERE project_id=p_project_id AND boq_item_id IS NULL
 UNION ALL SELECT 'client_payment_schedule',id,description FROM public.client_payment_schedule WHERE project_id=p_project_id AND boq_item_id IS NULL
 UNION ALL SELECT 'variation_orders',id,title FROM public.variation_orders WHERE project_id=p_project_id AND boq_item_id IS NULL LIMIT 200
 ) r),'[]'::jsonb));
 result:=jsonb_set(result,'{boq_data}',coalesce(project.boq_data,'{}'::jsonb)||jsonb_build_object('labour_overrides',coalesce((SELECT jsonb_agg(jsonb_build_object('worker_id',worker_id,'daily_rate',daily_rate)) FROM public.project_boq_worker_rates WHERE project_id=p_project_id),'[]'::jsonb)));
 result:=result||jsonb_build_object('workers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name)) FROM public.profiles p WHERE p.role='worker' AND EXISTS(SELECT 1 FROM public.project_role_assignments a WHERE a.project_id=p_project_id AND a.user_id=p.id AND a.role='worker')),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT project_id,revision,reason,changed_by,changed_at FROM public.project_boq_revisions WHERE project_id=p_project_id ORDER BY revision DESC LIMIT 10) r),'[]'::jsonb));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_project_boq(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_project_boq(uuid) TO authenticated;


COMMIT;
