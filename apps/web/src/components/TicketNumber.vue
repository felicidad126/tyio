<script lang="ts">
import { defineComponent, h } from 'vue';

// Nomor tiket (NPR/<jarkom>/<customer>/<tahun>/<bulan>/<urut>) hanya boleh patah setelah "/",
// agar di layar sempit tidak terpotong di tengah kode atau angka urut. Render function (bukan
// template) agar tidak ada spasi yang ikut di antara bagian nomor.
export default defineComponent({
  name: 'TicketNumber',
  props: { number: { type: String, required: true } },
  setup(props) {
    return () =>
      props.number.split('/').flatMap((part, i, all) => (i < all.length - 1 ? [`${part}/`, h('wbr')] : [part]));
  },
});
</script>
