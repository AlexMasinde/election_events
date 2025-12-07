import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('polling_centers')
export class PollingCenter {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 255 })
  county_code: string;

  @Column({ type: 'varchar', length: 255 })
  county_name: string;

  @Column({ type: 'varchar', length: 255 })
  constituency_code: string;

  @Column({ type: 'varchar', length: 255 })
  constituency_name: string;

  @Column({ type: 'varchar', length: 255 })
  ward_code: string;

  @Column({ type: 'varchar', length: 255 })
  ward_name: string;

  @Column({ type: 'varchar', length: 255 })
  polling_center_code: string;

  @Column({ type: 'varchar', length: 255 })
  polling_center_name: string;

  @Column({ type: 'varchar', length: 255, default: '0' })
  registered_voters: string;

  @Column({ type: 'varchar', length: 255, default: '0' })
  polling_stations: string;
}
